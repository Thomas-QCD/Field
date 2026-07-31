import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	type PointerEvent,
} from 'react';

type Point = { x: number; y: number };

export type SignaturePadHandle = {
	getCanvas: () => HTMLCanvasElement | null;
	isEmpty: () => boolean;
	toPngFile: (fileName: string) => Promise<File>;
	clear: () => void;
};

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
	const ctx = canvas.getContext('2d');
	if (!ctx || canvas.width === 0 || canvas.height === 0) return true;
	const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
			return false;
		}
	}
	return true;
}

function canvasToPngFile(
	canvas: HTMLCanvasElement,
	fileName: string,
): Promise<File> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('Could not export signature'));
					return;
				}
				resolve(new File([blob], fileName, { type: 'image/png' }));
			},
			'image/png',
			0.92,
		);
	});
}

/**
 * Full-bleed touch/mouse signature canvas. Parent must give it a sized box.
 */
export const SignaturePad = forwardRef<
	SignaturePadHandle,
	{
		className?: string;
		onStrokeEnd?: () => void;
	}
>(function SignaturePad({ className, onStrokeEnd }, ref) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawingRef = useRef(false);
	const lastRef = useRef<Point | null>(null);

	useImperativeHandle(ref, () => ({
		getCanvas: () => canvasRef.current,
		isEmpty: () => {
			const canvas = canvasRef.current;
			return !canvas || isCanvasBlank(canvas);
		},
		toPngFile: (fileName: string) => {
			const canvas = canvasRef.current;
			if (!canvas) return Promise.reject(new Error('Signature pad not ready'));
			return canvasToPngFile(canvas, fileName);
		},
		clear: () => {
			const canvas = canvasRef.current;
			const ctx = canvas?.getContext('2d');
			if (!canvas || !ctx) return;
			const rect = canvas.getBoundingClientRect();
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.restore();
			const dpr = Math.max(1, window.devicePixelRatio || 1);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.strokeStyle = '#111';
			ctx.lineWidth = 2.5;
		},
	}));

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const parent = canvas.parentElement;
		if (!parent) return;

		const resize = () => {
			const rect = parent.getBoundingClientRect();
			const dpr = Math.max(1, window.devicePixelRatio || 1);
			const cssW = Math.max(1, Math.floor(rect.width));
			const cssH = Math.max(1, Math.floor(rect.height));

			let snapshot: ImageData | null = null;
			const ctx = canvas.getContext('2d');
			if (ctx && canvas.width > 0 && canvas.height > 0) {
				try {
					snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
				} catch {
					snapshot = null;
				}
			}

			canvas.width = Math.floor(cssW * dpr);
			canvas.height = Math.floor(cssH * dpr);
			canvas.style.width = `${cssW}px`;
			canvas.style.height = `${cssH}px`;

			if (!ctx) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.strokeStyle = '#111';
			ctx.lineWidth = 2.5;
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, cssW, cssH);

			if (snapshot) {
				const tmp = document.createElement('canvas');
				tmp.width = snapshot.width;
				tmp.height = snapshot.height;
				const tmpCtx = tmp.getContext('2d');
				if (tmpCtx) {
					tmpCtx.putImageData(snapshot, 0, 0);
					ctx.drawImage(tmp, 0, 0, cssW, cssH);
				}
			}
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(parent);
		return () => ro.disconnect();
	}, []);

	const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
		const canvas = canvasRef.current!;
		const rect = canvas.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	};

	const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		drawingRef.current = true;
		lastRef.current = pointFromEvent(event);
	};

	const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
		if (!drawingRef.current) return;
		const ctx = canvasRef.current?.getContext('2d');
		const last = lastRef.current;
		if (!ctx || !last) return;
		const next = pointFromEvent(event);
		ctx.beginPath();
		ctx.moveTo(last.x, last.y);
		ctx.lineTo(next.x, next.y);
		ctx.stroke();
		lastRef.current = next;
	};

	const endStroke = (event: PointerEvent<HTMLCanvasElement>) => {
		if (!drawingRef.current) return;
		drawingRef.current = false;
		lastRef.current = null;
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			// ignore
		}
		onStrokeEnd?.();
	};

	return (
		<canvas
			ref={canvasRef}
			className={className}
			aria-label='Signature pad'
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endStroke}
			onPointerCancel={endStroke}
		/>
	);
});
