import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { Check, X } from 'lucide-react';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';

interface MultiShotCameraProps {
	onComplete: (files: File[]) => void;
	onCancel: () => void;
	/** Called when the in-app camera cannot start (e.g. no camera API). */
	onUnavailable?: () => void;
}

type CapturedShot = {
	id: string;
	file: File;
	previewUrl: string;
};

type CameraMode = 'native' | 'web';

/** Portrait-oriented labels (phone in portrait). */
type AspectRatio = '4:3' | '16:9' | '1:1' | 'full';

type PreviewRect = { x: number; y: number; w: number; h: number };

const ASPECT_OPTIONS: AspectRatio[] = ['4:3', '16:9', '1:1', 'full'];

const ASPECT_LABELS: Record<AspectRatio, string> = {
	'4:3': '4:3',
	'16:9': '16:9',
	'1:1': '1:1',
	full: 'Full',
};
const MAX_SHOTS = 30;
const JPEG_QUALITY = 0.85;
const NATIVE_CAPTURE_QUALITY = 85;
const ACTIVE_CLASS = 'multi-shot-camera-active';

async function ensureCameraPermission(): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
	const { camera } = await BarcodeScanner.requestPermissions();
	if (camera !== 'granted' && camera !== 'limited') {
		throw new Error('Camera permission is required to take photos');
	}
}

/** Full-bleed preview behind the WebView; Android system bars are masked natively. */
async function startNativePreview(): Promise<void> {
	await CameraPreview.start({
		position: 'rear',
		toBack: true,
		disableAudio: true,
		// TextureView composites in the normal view stack so MainActivity's
		// black system-bar covers can sit on top. SurfaceView punches through.
		enableOpacity: true,
		x: 0,
		y: 0,
		width: Math.round(window.innerWidth),
		height: Math.round(window.innerHeight),
	});
	try {
		await CameraPreview.setOpacity({ opacity: 1 });
	} catch {
		// Older plugin builds may lack setOpacity; preview still starts.
	}
}

function stampName(): string {
	return `photo-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
}

/** Width÷height for a portrait-oriented frame (or null = fill screen). */
function portraitAspectValue(aspect: AspectRatio): number | null {
	switch (aspect) {
		case '4:3':
			return 3 / 4;
		case '16:9':
			return 9 / 16;
		case '1:1':
			return 1;
		case 'full':
			return null;
	}
}

/** Largest rect of `aspect` that fits inside the viewport (letterboxed). */
function fitPreviewRect(
	boxW: number,
	boxH: number,
	aspect: AspectRatio,
): PreviewRect {
	const ratio = portraitAspectValue(aspect);
	if (ratio == null) {
		return { x: 0, y: 0, w: boxW, h: boxH };
	}

	let w = boxW;
	let h = Math.round(w / ratio);
	if (h > boxH) {
		h = boxH;
		w = Math.round(h * ratio);
	}
	return {
		x: Math.round((boxW - w) / 2),
		y: Math.round((boxH - h) / 2),
		w,
		h,
	};
}

function cropRect(
	sourceW: number,
	sourceH: number,
	aspect: AspectRatio,
): PreviewRect {
	const target = portraitAspectValue(aspect);
	if (target == null) {
		return { x: 0, y: 0, w: sourceW, h: sourceH };
	}

	const ratio = sourceW >= sourceH ? 1 / target : target;
	const sourceRatio = sourceW / sourceH;

	if (sourceRatio > ratio) {
		const h = sourceH;
		const w = Math.round(sourceH * ratio);
		return { x: Math.round((sourceW - w) / 2), y: 0, w, h };
	}
	const w = sourceW;
	const h = Math.round(sourceW / ratio);
	return { x: 0, y: Math.round((sourceH - h) / 2), w, h };
}

function canvasToJpegFile(canvas: HTMLCanvasElement): Promise<File> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Could not capture photo'));
					return;
				}
				resolve(new File([blob], stampName(), { type: 'image/jpeg' }));
			},
			'image/jpeg',
			JPEG_QUALITY,
		);
	});
}

function base64ToImage(base64: string): Promise<HTMLImageElement> {
	const raw = base64.includes(',')
		? base64
		: `data:image/jpeg;base64,${base64}`;
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Could not read captured photo'));
		img.src = raw;
	});
}

async function cropImageSource(
	source: HTMLImageElement | HTMLVideoElement,
	aspect: AspectRatio,
): Promise<File> {
	const sourceW =
		source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
	const sourceH =
		source instanceof HTMLVideoElement
			? source.videoHeight
			: source.naturalHeight;
	if (!sourceW || !sourceH) {
		throw new Error('Camera is not ready yet');
	}

	const { x, y, w, h } = cropRect(sourceW, sourceH, aspect);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not capture photo');
	ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
	return canvasToJpegFile(canvas);
}

function setNativeOverlayActive(active: boolean) {
	document.documentElement.classList.toggle(ACTIVE_CLASS, active);
	document.body.classList.toggle(ACTIVE_CLASS, active);
	document.getElementById('root')?.classList.toggle(ACTIVE_CLASS, active);
}

function LetterboxBars({
	rect,
	boxW,
	boxH,
}: {
	rect: PreviewRect;
	boxW: number;
	boxH: number;
}) {
	return (
		<>
			{rect.y > 0 ? (
				<div
					className='multi-shot-camera-bar'
					style={{ top: 0, left: 0, width: boxW, height: rect.y }}
					aria-hidden
				/>
			) : null}
			{rect.y + rect.h < boxH ? (
				<div
					className='multi-shot-camera-bar'
					style={{
						top: rect.y + rect.h,
						left: 0,
						width: boxW,
						height: boxH - rect.y - rect.h,
					}}
					aria-hidden
				/>
			) : null}
			{rect.x > 0 ? (
				<div
					className='multi-shot-camera-bar'
					style={{
						top: rect.y,
						left: 0,
						width: rect.x,
						height: rect.h,
					}}
					aria-hidden
				/>
			) : null}
			{rect.x + rect.w < boxW ? (
				<div
					className='multi-shot-camera-bar'
					style={{
						top: rect.y,
						left: rect.x + rect.w,
						width: boxW - rect.x - rect.w,
						height: rect.h,
					}}
					aria-hidden
				/>
			) : null}
		</>
	);
}

/**
 * In-app camera session: shutter repeatedly without leaving for OK/Retry.
 * Preview is letterboxed to the selected aspect; outside is black.
 */
export function MultiShotCamera({
	onComplete,
	onCancel,
	onUnavailable,
}: MultiShotCameraProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const modeRef = useRef<CameraMode | null>(null);
	const shotsRef = useRef<CapturedShot[]>([]);
	const aspectRef = useRef<AspectRatio>('4:3');
	const nativeRunningRef = useRef(false);
	const onUnavailableRef = useRef(onUnavailable);
	const aspectWrapRef = useRef<HTMLDivElement>(null);
	const [shots, setShots] = useState<CapturedShot[]>([]);
	const [mode, setMode] = useState<CameraMode | null>(null);
	const [aspect, setAspect] = useState<AspectRatio>('4:3');
	const [aspectOpen, setAspectOpen] = useState(false);
	const [viewport, setViewport] = useState({
		w: window.innerWidth,
		h: window.innerHeight,
	});
	const [ready, setReady] = useState(false);
	const [capturing, setCapturing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [startFailed, setStartFailed] = useState(false);
	const [flash, setFlash] = useState(false);

	const previewRect = fitPreviewRect(viewport.w, viewport.h, aspect);

	onUnavailableRef.current = onUnavailable;
	aspectRef.current = aspect;
	useAndroidBackHandler(onCancel, true);

	useEffect(() => {
		shotsRef.current = shots;
	}, [shots]);

	useEffect(() => {
		modeRef.current = mode;
	}, [mode]);

	useEffect(() => {
		const onResize = () => {
			setViewport({ w: window.innerWidth, h: window.innerHeight });
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	useEffect(() => {
		if (!aspectOpen) return;

		const onPointerDown = (event: PointerEvent) => {
			if (!aspectWrapRef.current?.contains(event.target as Node)) {
				setAspectOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setAspectOpen(false);
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [aspectOpen]);

	// Open permissions + start camera (native preview is always full-screen;
	// aspect is applied with black letterbox bars on top).
	useEffect(() => {
		let cancelled = false;

		const start = async () => {
			try {
				await ensureCameraPermission();
				if (cancelled) return;

				if (Capacitor.isNativePlatform()) {
					// Set native mode first so the empty <video> placeholder never mounts.
					setNativeOverlayActive(true);
					setMode('native');
					await startNativePreview();
					if (cancelled) {
						await CameraPreview.stop().catch(() => undefined);
						setNativeOverlayActive(false);
						return;
					}
					nativeRunningRef.current = true;
					setReady(true);
					return;
				}

				const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(
					navigator.mediaDevices,
				);
				if (!getUserMedia) {
					throw new Error('Camera is not available in this browser');
				}

				const stream = await getUserMedia({
					audio: false,
					video: {
						facingMode: { ideal: 'environment' },
						width: { ideal: 1920 },
						height: { ideal: 1440 },
					},
				});
				if (cancelled) {
					for (const track of stream.getTracks()) track.stop();
					return;
				}

				streamRef.current = stream;
				setMode('web');
			} catch (err: unknown) {
				if (cancelled) return;
				setNativeOverlayActive(false);
				setStartFailed(true);
				setError(
					err instanceof Error
						? err.message
						: 'Could not open the camera',
				);
				if (onUnavailableRef.current) {
					onUnavailableRef.current();
				}
			}
		};

		void start();

		return () => {
			cancelled = true;
			const stream = streamRef.current;
			streamRef.current = null;
			if (stream) {
				for (const track of stream.getTracks()) track.stop();
			}
			const video = videoRef.current;
			if (video) video.srcObject = null;

			if (nativeRunningRef.current || Capacitor.isNativePlatform()) {
				nativeRunningRef.current = false;
				void CameraPreview.stop().catch(() => undefined);
				setNativeOverlayActive(false);
			}

			for (const shot of shotsRef.current) {
				URL.revokeObjectURL(shot.previewUrl);
			}
		};
	}, []);

	// Attach getUserMedia stream once the web <video> is mounted.
	useEffect(() => {
		if (mode !== 'web') return;
		const stream = streamRef.current;
		const video = videoRef.current;
		if (!stream || !video) return;

		let cancelled = false;
		video.srcObject = stream;
		void video.play().then(() => {
			if (!cancelled) setReady(true);
		});

		return () => {
			cancelled = true;
		};
	}, [mode]);

	const selectAspect = (next: AspectRatio) => {
		setAspect(next);
		setAspectOpen(false);
	};

	const handleShutter = async () => {
		if (!ready || capturing || !mode) return;
		if (shots.length >= MAX_SHOTS) {
			setError(`Maximum of ${MAX_SHOTS} photos per session`);
			return;
		}

		setCapturing(true);
		setError(null);
		setFlash(true);
		window.setTimeout(() => setFlash(false), 120);

		try {
			const currentAspect = aspectRef.current;
			let file: File;
			if (mode === 'native') {
				const result = await CameraPreview.capture({
					quality: NATIVE_CAPTURE_QUALITY,
				});
				const img = await base64ToImage(result.value);
				file = await cropImageSource(img, currentAspect);
			} else {
				const video = videoRef.current;
				if (!video) throw new Error('Camera is not ready yet');
				file = await cropImageSource(video, currentAspect);
			}

			const shot: CapturedShot = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				file,
				previewUrl: URL.createObjectURL(file),
			};
			setShots((prev) => [...prev, shot]);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Capture failed');
		} finally {
			setCapturing(false);
		}
	};

	const removeShot = (id: string) => {
		setShots((prev) => {
			const next = prev.filter((s) => s.id !== id);
			const removed = prev.find((s) => s.id === id);
			if (removed) URL.revokeObjectURL(removed.previewUrl);
			return next;
		});
	};

	const handleDone = () => {
		const files = shots.map((s) => s.file);
		for (const shot of shots) {
			URL.revokeObjectURL(shot.previewUrl);
		}
		setShots([]);
		onComplete(files);
	};

	if (startFailed && onUnavailable) {
		return null;
	}

	const previewStyle = {
		top: previewRect.y,
		left: previewRect.x,
		width: previewRect.w,
		height: previewRect.h,
	};

	return createPortal(
		<div
			className={
				mode === 'native'
					? 'multi-shot-camera multi-shot-camera--native'
					: 'multi-shot-camera'
			}
			role='dialog'
			aria-label='Take photos'
		>
			{mode === 'web' ? (
				<video
					ref={videoRef}
					className='multi-shot-camera-video'
					playsInline
					muted
					autoPlay
				/>
			) : null}

			<LetterboxBars
				rect={previewRect}
				boxW={viewport.w}
				boxH={viewport.h}
			/>

			{flash ? (
				<div
					className='multi-shot-camera-flash'
					style={previewStyle}
					aria-hidden
				/>
			) : null}

			<header className='multi-shot-camera-header'>
				<button
					type='button'
					className='multi-shot-camera-text-btn'
					onClick={onCancel}
				>
					Cancel
				</button>
				<span className='multi-shot-camera-count'>
					{shots.length > 0
						? `${shots.length} photo${shots.length === 1 ? '' : 's'}`
						: null}
				</span>
				<button
					type='button'
					className='multi-shot-camera-text-btn multi-shot-camera-text-btn--done'
					disabled={shots.length === 0}
					onClick={handleDone}
				>
					<Check size={18} strokeWidth={2.5} aria-hidden />
					Done
				</button>
			</header>

			{error ? (
				<p className='multi-shot-camera-error' role='alert'>
					{error}
				</p>
			) : null}

			{shots.length > 0 ? (
				<ul className='multi-shot-camera-thumbs' aria-label='Captured photos'>
					{shots.map((shot) => (
						<li key={shot.id} className='multi-shot-camera-thumb'>
							<img src={shot.previewUrl} alt='' />
							<button
								type='button'
								className='multi-shot-camera-thumb-remove'
								aria-label='Remove photo'
								onClick={() => removeShot(shot.id)}
							>
								<X size={14} strokeWidth={2.5} aria-hidden />
							</button>
						</li>
					))}
				</ul>
			) : null}

			<footer className='multi-shot-camera-footer'>
				<div
					ref={aspectWrapRef}
					className={
						aspectOpen
							? 'multi-shot-camera-aspect-wrap multi-shot-camera-aspect-wrap--open'
							: 'multi-shot-camera-aspect-wrap'
					}
				>
					<button
						type='button'
						className='multi-shot-camera-aspect'
						aria-expanded={aspectOpen}
						aria-haspopup='listbox'
						aria-label='Aspect ratio'
						onClick={() => setAspectOpen((prev) => !prev)}
					>
						{ASPECT_LABELS[aspect]}
					</button>
					{aspectOpen ? (
						<div
							className='multi-shot-camera-aspect-popover'
							role='listbox'
							aria-label='Aspect ratio'
						>
							{ASPECT_OPTIONS.map((option) => (
								<button
									key={option}
									type='button'
									role='option'
									aria-selected={option === aspect}
									className={
										option === aspect
											? 'multi-shot-camera-aspect-option multi-shot-camera-aspect-option--active'
											: 'multi-shot-camera-aspect-option'
									}
									onClick={() => selectAspect(option)}
								>
									{ASPECT_LABELS[option]}
								</button>
							))}
						</div>
					) : null}
				</div>
				<button
					type='button'
					className='multi-shot-camera-shutter'
					aria-label='Take photo'
					disabled={!ready || capturing || shots.length >= MAX_SHOTS}
					onClick={() => void handleShutter()}
				/>
				<span className='multi-shot-camera-footer-spacer' aria-hidden />
			</footer>
		</div>,
		document.body,
	);
}
