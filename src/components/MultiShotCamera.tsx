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
	/** Null while JPEG encode is still running in the background. */
	file: File | null;
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
/** Cap long edge so canvas → JPEG stays snappy on phones. */
const MAX_OUTPUT_EDGE = 1920;
const ACTIVE_CLASS = 'multi-shot-camera-active';
/** CameraPreview.start can hang on some Android devices (esp. TextureView). */
const NATIVE_START_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new Error(message));
		}, ms);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				window.clearTimeout(timer);
				reject(err);
			},
		);
	});
}

async function ensureCameraPermission(): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	// ML Kit permission helper is Android-only (not linked on iOS — breaks simulators).
	// On iOS, CameraPreview.start prompts via NSCameraUsageDescription.
	if (Capacitor.getPlatform() !== 'android') return;
	const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
	const { camera } = await BarcodeScanner.requestPermissions();
	if (camera !== 'granted' && camera !== 'limited') {
		throw new Error('Camera permission is required to take photos');
	}
}

async function startWebPreview(): Promise<MediaStream> {
	const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(
		navigator.mediaDevices,
	);
	if (!getUserMedia) {
		throw new Error('Camera is not available in this browser');
	}
	return getUserMedia({
		audio: false,
		video: {
			facingMode: { ideal: 'environment' },
			width: { ideal: 1920 },
			height: { ideal: 1440 },
		},
	});
}

/**
 * Full-bleed preview behind the WebView. Use SurfaceView (no enableOpacity):
 * TextureView + enableOpacity has hung start() on installed Android builds,
 * leaving the shutter disabled with no error.
 */
async function startNativePreview(): Promise<void> {
	await withTimeout(
		CameraPreview.start({
			position: 'rear',
			toBack: true,
			disableAudio: true,
			x: 0,
			y: 0,
			width: Math.round(window.innerWidth),
			height: Math.round(window.innerHeight),
		}),
		NATIVE_START_TIMEOUT_MS,
		'Camera preview timed out — try again or use the library',
	);
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

function revokePreviewUrl(url: string) {
	if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function base64DataUrl(base64: string): string {
	return base64.includes(',')
		? base64
		: `data:image/jpeg;base64,${base64}`;
}

/** Sync File from native capture JPEG — skip canvas re-encode when aspect is full. */
function base64ToJpegFile(base64: string): File {
	const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
	const binary = atob(raw);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new File([bytes], stampName(), { type: 'image/jpeg' });
}

function base64ToImage(base64: string): Promise<HTMLImageElement> {
	const raw = base64DataUrl(base64);
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Could not read captured photo'));
		img.src = raw;
	});
}

function sourceSize(
	source: HTMLImageElement | HTMLVideoElement,
): { w: number; h: number } {
	if (source instanceof HTMLVideoElement) {
		return { w: source.videoWidth, h: source.videoHeight };
	}
	return { w: source.naturalWidth, h: source.naturalHeight };
}

/** Crop source onto a canvas (drawImage is sync; JPEG encode stays async). */
function drawSourceToCanvas(
	source: HTMLImageElement | HTMLVideoElement,
	aspect: AspectRatio,
): HTMLCanvasElement {
	const { w: sourceW, h: sourceH } = sourceSize(source);
	if (!sourceW || !sourceH) {
		throw new Error('Camera is not ready yet');
	}

	const { x, y, w, h } = cropRect(sourceW, sourceH, aspect);
	const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(w, h));
	const outW = Math.max(1, Math.round(w * scale));
	const outH = Math.max(1, Math.round(h * scale));
	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not capture photo');
	ctx.drawImage(source, x, y, w, h, 0, 0, outW, outH);
	return canvas;
}

/** Small sync data-URL for the strip thumb so UI updates before toBlob finishes. */
function canvasThumbPreviewUrl(canvas: HTMLCanvasElement): string {
	const maxEdge = 140;
	const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
	const tw = Math.max(1, Math.round(canvas.width * scale));
	const th = Math.max(1, Math.round(canvas.height * scale));
	const thumb = document.createElement('canvas');
	thumb.width = tw;
	thumb.height = th;
	const ctx = thumb.getContext('2d');
	if (!ctx) return canvas.toDataURL('image/jpeg', 0.6);
	ctx.drawImage(canvas, 0, 0, tw, th);
	return thumb.toDataURL('image/jpeg', 0.7);
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

		const attachWebStream = async (stream: MediaStream) => {
			if (cancelled) {
				for (const track of stream.getTracks()) track.stop();
				return;
			}
			streamRef.current = stream;
			setMode('web');
		};

		const start = async () => {
			try {
				await ensureCameraPermission();
				if (cancelled) return;

				// Prefer getUserMedia when the WebView exposes it (HTTPS / Capacitor
				// secure origins). Avoids CameraPreview start hangs that leave the
				// shutter disabled with no error on installed Android builds.
				if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
					try {
						const stream = await startWebPreview();
						await attachWebStream(stream);
						return;
					} catch {
						// Fall through to CameraPreview on native; rethrow on web.
						if (!Capacitor.isNativePlatform()) throw new Error('Camera is not available');
					}
				}

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

				throw new Error('Camera is not available in this browser');
			} catch (err: unknown) {
				if (cancelled) return;
				setNativeOverlayActive(false);
				setStartFailed(true);
				setError(
					err instanceof Error ? err.message : 'Could not open the camera',
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
				revokePreviewUrl(shot.previewUrl);
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

		const shotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		try {
			const currentAspect = aspectRef.current;

			if (mode === 'native') {
				const result = await CameraPreview.capture({
					quality: NATIVE_CAPTURE_QUALITY,
				});
				const dataUrl = base64DataUrl(result.value);

				if (currentAspect === 'full') {
					const file = base64ToJpegFile(result.value);
					setShots((prev) => [
						...prev,
						{ id: shotId, file, previewUrl: dataUrl },
					]);
					return;
				}

				// Show uncropped capture immediately; crop + re-encode in background.
				setShots((prev) => [
					...prev,
					{ id: shotId, file: null, previewUrl: dataUrl },
				]);

				void (async () => {
					try {
						const img = await base64ToImage(result.value);
						const canvas = drawSourceToCanvas(img, currentAspect);
						const file = await canvasToJpegFile(canvas);
						const croppedPreview = URL.createObjectURL(file);
						setShots((prev) => {
							const existing = prev.find((s) => s.id === shotId);
							if (!existing) {
								URL.revokeObjectURL(croppedPreview);
								return prev;
							}
							return prev.map((s) =>
								s.id === shotId
									? { id: shotId, file, previewUrl: croppedPreview }
									: s,
							);
						});
					} catch (err: unknown) {
						setShots((prev) => {
							const existing = prev.find((s) => s.id === shotId);
							if (existing) revokePreviewUrl(existing.previewUrl);
							return prev.filter((s) => s.id !== shotId);
						});
						setError(
							err instanceof Error ? err.message : 'Capture failed',
						);
					}
				})();
				return;
			}

			const video = videoRef.current;
			if (!video) throw new Error('Camera is not ready yet');

			const canvas = drawSourceToCanvas(video, currentAspect);
			const previewUrl = canvasThumbPreviewUrl(canvas);
			setShots((prev) => [
				...prev,
				{ id: shotId, file: null, previewUrl },
			]);

			void (async () => {
				try {
					const file = await canvasToJpegFile(canvas);
					const blobPreview = URL.createObjectURL(file);
					setShots((prev) => {
						const existing = prev.find((s) => s.id === shotId);
						if (!existing) {
							URL.revokeObjectURL(blobPreview);
							return prev;
						}
						return prev.map((s) => {
							if (s.id !== shotId) return s;
							revokePreviewUrl(s.previewUrl);
							return { id: shotId, file, previewUrl: blobPreview };
						});
					});
				} catch (err: unknown) {
					setShots((prev) => {
						const existing = prev.find((s) => s.id === shotId);
						if (existing) revokePreviewUrl(existing.previewUrl);
						return prev.filter((s) => s.id !== shotId);
					});
					setError(
						err instanceof Error ? err.message : 'Capture failed',
					);
				}
			})();
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
			if (removed) revokePreviewUrl(removed.previewUrl);
			return next;
		});
	};

	const encoding = shots.some((s) => s.file == null);

	const handleDone = () => {
		if (encoding) return;
		const files = shots
			.map((s) => s.file)
			.filter((f): f is File => f != null);
		for (const shot of shots) {
			revokePreviewUrl(shot.previewUrl);
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

			<LetterboxBars rect={previewRect} boxW={viewport.w} boxH={viewport.h} />

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
					disabled={shots.length === 0 || encoding}
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
			) : !ready ? (
				<p className='multi-shot-camera-status' role='status'>
					Starting camera…
				</p>
			) : null}

			{shots.length > 0 ? (
				<ul className='multi-shot-camera-thumbs' aria-label='Captured photos'>
					{shots.map((shot) => (
						<li
							key={shot.id}
							className={
								shot.file == null
									? 'multi-shot-camera-thumb multi-shot-camera-thumb--encoding'
									: 'multi-shot-camera-thumb'
							}
						>
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
