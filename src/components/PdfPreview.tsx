import { useEffect, useRef, useState } from 'react';
import { Loader } from '@mantine/core';
import type {
	PDFDocumentLoadingTask,
	PDFDocumentProxy,
	RenderTask,
} from 'pdfjs-dist';

interface PdfPreviewProps {
	url: string;
	title: string;
	className?: string;
	/** Render every page (fullscreen viewer). Default: first page only. */
	fullDocument?: boolean;
}

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
	if (!pdfjsPromise) {
		pdfjsPromise = (async () => {
			const pdfjs = await import('pdfjs-dist');
			const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
			pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
			return pdfjs;
		})();
	}
	return pdfjsPromise;
}

/**
 * Canvas PDF preview. Android WebView (and some iOS WKWebViews) cannot
 * render PDFs inside an iframe; pdf.js paints pages to canvas instead.
 */
export function PdfPreview({
	url,
	title,
	className,
	fullDocument = false,
}: PdfPreviewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !url) return;

		const session: {
			cancelled: boolean;
			renderTasks: RenderTask[];
			loadingTask: PDFDocumentLoadingTask | null;
			pdf: PDFDocumentProxy | null;
		} = {
			cancelled: false,
			renderTasks: [],
			loadingTask: null,
			pdf: null,
		};

		const run = async () => {
			setStatus('loading');
			setErrorMessage(null);
			container.replaceChildren();

			try {
				const pdfjs = await loadPdfjs();
				if (session.cancelled) return;

				session.loadingTask = pdfjs.getDocument({
					url,
					withCredentials: false,
					// Avoid range requests — S3 signed URLs + CORS are simpler as one GET.
					disableRange: true,
					disableStream: true,
				});
				const pdf = await session.loadingTask.promise;
				session.pdf = pdf;
				if (session.cancelled) {
					await pdf.cleanup();
					return;
				}

				const pageCount = fullDocument
					? pdf.numPages
					: Math.min(1, pdf.numPages);
				const maxWidth = container.clientWidth || window.innerWidth || 360;

				for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
					if (session.cancelled) break;
					const page = await pdf.getPage(pageNum);
					if (session.cancelled) {
						page.cleanup();
						break;
					}

					const unscaled = page.getViewport({ scale: 1 });
					const scale = Math.min(2, maxWidth / unscaled.width);
					const viewport = page.getViewport({ scale });
					const outputScale = Math.min(window.devicePixelRatio || 1, 2);

					const canvas = document.createElement('canvas');
					canvas.className = 'pdf-preview-page';
					canvas.setAttribute('role', 'img');
					canvas.setAttribute(
						'aria-label',
						pageCount > 1 ? `${title} — page ${pageNum}` : title,
					);
					canvas.width = Math.floor(viewport.width * outputScale);
					canvas.height = Math.floor(viewport.height * outputScale);
					canvas.style.width = `${Math.floor(viewport.width)}px`;
					canvas.style.height = `${Math.floor(viewport.height)}px`;

					const ctx = canvas.getContext('2d');
					if (!ctx) {
						page.cleanup();
						throw new Error('Canvas unavailable');
					}
					ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

					container.appendChild(canvas);
					const task = page.render({
						canvasContext: ctx,
						viewport,
						canvas,
					});
					session.renderTasks.push(task);
					await task.promise;
					page.cleanup();
				}

				if (!session.cancelled) setStatus('ready');
			} catch (err: unknown) {
				if (session.cancelled) return;
				const name =
					err && typeof err === 'object' && 'name' in err
						? String((err as { name: unknown }).name)
						: '';
				if (name === 'RenderingCancelledException') return;
				setStatus('error');
				setErrorMessage(
					err instanceof Error ? err.message : 'Failed to render PDF',
				);
			}
		};

		void run();

		return () => {
			session.cancelled = true;
			for (const task of session.renderTasks) {
				try {
					task.cancel();
				} catch {
					// ignore
				}
			}
			if (session.loadingTask) {
				void session.loadingTask.destroy().catch(() => {});
			}
			if (session.pdf) {
				void session.pdf.cleanup().catch(() => {});
			}
		};
	}, [url, title, fullDocument]);

	return (
		<div
			className={['pdf-preview', className].filter(Boolean).join(' ')}
			data-status={status}
		>
			{status === 'loading' ? (
				<div className='pdf-preview-status'>
					<Loader size='sm' color='gray' />
				</div>
			) : null}
			{status === 'error' ? (
				<div className='pdf-preview-status pdf-preview-status--error'>
					{errorMessage ?? 'Could not preview PDF'}
				</div>
			) : null}
			<div ref={containerRef} className='pdf-preview-pages' />
		</div>
	);
}
