import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UnstyledButton } from '@mantine/core';
import { X } from 'lucide-react';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { PdfPreview } from './PdfPreview';

interface AttachmentViewerProps {
	opened: boolean;
	url: string | null;
	mimeType: string;
	fileName: string;
	onClose: () => void;
}

function isImageMime(mimeType: string): boolean {
	return mimeType.startsWith('image/');
}

function isVideoMime(mimeType: string): boolean {
	return mimeType.startsWith('video/');
}

type TouchPoint = { clientX: number; clientY: number };

function touchDistance(a: TouchPoint, b: TouchPoint): number {
	return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMid(a: TouchPoint, b: TouchPoint): { x: number; y: number } {
	return {
		x: (a.clientX + b.clientX) / 2,
		y: (a.clientY + b.clientY) / 2,
	};
}

/**
 * Fullscreen exclusive attachment view. Images support pinch-to-zoom + pan;
 * PDF/text open in a full-bleed frame.
 */
export function AttachmentViewer({
	opened,
	url,
	mimeType,
	fileName,
	onClose,
}: AttachmentViewerProps) {
	const imageRef = useRef<HTMLImageElement>(null);
	const [videoFailed, setVideoFailed] = useState(false);
	const transform = useRef({ scale: 1, x: 0, y: 0 });
	const gesture = useRef({
		mode: 'none' as 'none' | 'pan' | 'pinch',
		startScale: 1,
		startX: 0,
		startY: 0,
		startDistance: 0,
		startMidX: 0,
		startMidY: 0,
		startTouchX: 0,
		startTouchY: 0,
	});
	const [, bump] = useState(0);

	const applyTransform = () => {
		const el = imageRef.current;
		if (!el) return;
		const { scale, x, y } = transform.current;
		el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
	};

	const resetTransform = () => {
		transform.current = { scale: 1, x: 0, y: 0 };
		applyTransform();
		bump((n) => n + 1);
	};

	useAndroidBackHandler(onClose, opened);

	useEffect(() => {
		setVideoFailed(false);
	}, [url, mimeType, opened]);

	useEffect(() => {
		if (!opened) {
			resetTransform();
			return;
		}

		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);

		return () => {
			document.body.style.overflow = prevOverflow;
			window.removeEventListener('keydown', onKey);
		};
	}, [opened, onClose]);

	if (!opened || !url) return null;

	const clampScale = (value: number) => Math.min(4, Math.max(1, value));

	const onTouchStart = (e: React.TouchEvent) => {
		if (!isImageMime(mimeType)) return;
		const g = gesture.current;
		const t = transform.current;

		if (e.touches.length >= 2) {
			e.preventDefault();
			g.mode = 'pinch';
			g.startScale = t.scale;
			g.startX = t.x;
			g.startY = t.y;
			g.startDistance = touchDistance(e.touches[0], e.touches[1]);
			const mid = touchMid(e.touches[0], e.touches[1]);
			g.startMidX = mid.x;
			g.startMidY = mid.y;
			return;
		}

		if (e.touches.length === 1 && t.scale > 1) {
			g.mode = 'pan';
			g.startX = t.x;
			g.startY = t.y;
			g.startTouchX = e.touches[0].clientX;
			g.startTouchY = e.touches[0].clientY;
		}
	};

	const onTouchMove = (e: React.TouchEvent) => {
		if (!isImageMime(mimeType)) return;
		const g = gesture.current;
		const t = transform.current;

		if (g.mode === 'pinch' && e.touches.length >= 2) {
			e.preventDefault();
			const dist = touchDistance(e.touches[0], e.touches[1]);
			const mid = touchMid(e.touches[0], e.touches[1]);
			const nextScale = clampScale(
				g.startScale * (dist / Math.max(g.startDistance, 1)),
			);
			const scaleRatio = nextScale / g.startScale;
			t.scale = nextScale;
			t.x = g.startX * scaleRatio + (mid.x - g.startMidX);
			t.y = g.startY * scaleRatio + (mid.y - g.startMidY);
			applyTransform();
			return;
		}

		if (g.mode === 'pan' && e.touches.length === 1) {
			e.preventDefault();
			t.x = g.startX + (e.touches[0].clientX - g.startTouchX);
			t.y = g.startY + (e.touches[0].clientY - g.startTouchY);
			applyTransform();
		}
	};

	const onTouchEnd = (e: React.TouchEvent) => {
		if (!isImageMime(mimeType)) return;
		const g = gesture.current;
		const t = transform.current;

		if (e.touches.length === 0) {
			g.mode = 'none';
			if (t.scale <= 1.05) {
				resetTransform();
			}
			return;
		}

		if (e.touches.length === 1 && t.scale > 1) {
			g.mode = 'pan';
			g.startX = t.x;
			g.startY = t.y;
			g.startTouchX = e.touches[0].clientX;
			g.startTouchY = e.touches[0].clientY;
		}
	};

	const onDoubleClick = () => {
		if (!isImageMime(mimeType)) return;
		const t = transform.current;
		if (t.scale > 1) {
			resetTransform();
		} else {
			t.scale = 2.5;
			t.x = 0;
			t.y = 0;
			applyTransform();
			bump((n) => n + 1);
		}
	};

	let content: ReactNode;
	if (isImageMime(mimeType)) {
		content = (
			<div
				className='attachment-viewer-stage'
				onTouchStart={onTouchStart}
				onTouchMove={onTouchMove}
				onTouchEnd={onTouchEnd}
				onTouchCancel={onTouchEnd}
				onDoubleClick={onDoubleClick}
			>
				<img
					ref={imageRef}
					src={url}
					alt={fileName}
					className='attachment-viewer-image'
					draggable={false}
				/>
			</div>
		);
	} else if (isVideoMime(mimeType)) {
		content = (
			<div className='attachment-viewer-stage attachment-viewer-stage-video'>
				{videoFailed || !url ? (
					<div className='attachment-viewer-video-fallback'>
						<p>
							This video can’t play in this browser (phone recordings are often
							HEVC/H.265). Download it to play in a native player.
						</p>
						{url ? (
							<a
								className='attachment-viewer-video-download'
								href={url}
								download={fileName}
								target='_blank'
								rel='noopener noreferrer'
							>
								Download video
							</a>
						) : null}
					</div>
				) : (
					<video
						key={url}
						src={url}
						controls
						playsInline
						preload='metadata'
						className='attachment-viewer-video'
						onError={() => setVideoFailed(true)}
					>
						{fileName}
					</video>
				)}
			</div>
		);
	} else if (mimeType === 'application/pdf') {
		content = (
			<PdfPreview
				url={url}
				title={fileName}
				fullDocument
				className='attachment-viewer-pdf'
			/>
		);
	} else {
		content = (
			<iframe title={fileName} src={url} className='attachment-viewer-frame' />
		);
	}

	return createPortal(
		<div
			className='attachment-viewer'
			role='dialog'
			aria-modal='true'
			aria-label={fileName}
		>
			<header className='attachment-viewer-header'>
				<span className='attachment-viewer-title'>{fileName}</span>
				<UnstyledButton
					className='attachment-viewer-close'
					aria-label='Close'
					onClick={onClose}
				>
					<X size={24} strokeWidth={2} aria-hidden />
				</UnstyledButton>
			</header>
			{content}
			{isImageMime(mimeType) ? (
				<p className='attachment-viewer-hint'>Pinch to zoom · double-tap</p>
			) : null}
		</div>,
		document.body,
	);
}
