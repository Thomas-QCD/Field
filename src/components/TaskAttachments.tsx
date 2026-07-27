import { useEffect, useId, useRef, useState } from 'react';
import {
	Alert,
	Badge,
	Button,
	Group,
	Loader,
	Stack,
	Text,
	UnstyledButton,
} from '@mantine/core';
import { Download, Film, Paperclip, Trash2 } from 'lucide-react';
import {
	attachmentAcceptAttr,
	deleteAttachment,
	getAttachmentDownloadUrl,
	isVideoMime,
	listAttachments,
	uploadAttachment,
	validateAttachmentFile,
} from '../api/attachments';
import { useCurrentUser } from '../context/CurrentUserContext';
import { formatShortName } from '../formatName';
import { formatTimeAgo } from '../formatTime';
import type { TaskAttachment } from '../types/task';
import { AttachmentViewer } from './AttachmentViewer';
import { PdfPreview } from './PdfPreview';

function formatBytes(bytes: number | null): string {
	if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isViewableMime(mimeType: string): boolean {
	return (
		mimeType.startsWith('image/') ||
		isVideoMime(mimeType) ||
		mimeType === 'application/pdf' ||
		mimeType === 'text/plain'
	);
}

interface TaskAttachmentsProps {
	taskId: number;
	initialAttachments?: TaskAttachment[];
	/** Compact layout for mobile task view — renders viewable files inline */
	variant?: 'section' | 'plain';
}

export function TaskAttachments({
	taskId,
	initialAttachments,
	variant = 'section',
}: TaskAttachmentsProps) {
	const { user } = useCurrentUser();
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const previewMode = variant === 'plain';

	const [attachments, setAttachments] = useState<TaskAttachment[]>(
		initialAttachments ?? [],
	);
	const [loading, setLoading] = useState(!initialAttachments);
	const [uploading, setUploading] = useState(false);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	/** Signed inline URLs for previewable attachments */
	const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
	const [previewLoading, setPreviewLoading] = useState(false);
	const previewUrlsRef = useRef(previewUrls);
	previewUrlsRef.current = previewUrls;
	const [viewerAttachment, setViewerAttachment] =
		useState<TaskAttachment | null>(null);

	useEffect(() => {
		setAttachments(initialAttachments ?? []);
	}, [initialAttachments]);

	useEffect(() => {
		if (initialAttachments) return;

		const controller = new AbortController();
		setLoading(true);
		setError(null);

		listAttachments(taskId, controller.signal)
			.then((list) => {
				if (!controller.signal.aborted) setAttachments(list);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(
					err instanceof Error ? err.message : 'Failed to load attachments',
				);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [taskId, initialAttachments]);

	useEffect(() => {
		if (!previewMode || loading) return;

		const viewable = attachments.filter((a) => isViewableMime(a.mimeType));
		const keepIds = new Set(viewable.map((a) => a.id));
		const cached = previewUrlsRef.current;

		const pruned: Record<number, string> = {};
		for (const [key, url] of Object.entries(cached)) {
			const id = Number(key);
			if (keepIds.has(id)) pruned[id] = url;
		}
		if (Object.keys(pruned).length !== Object.keys(cached).length) {
			setPreviewUrls(pruned);
		}

		const needed = viewable.filter((a) => !cached[a.id]);
		if (needed.length === 0) return;

		let cancelled = false;
		setPreviewLoading(true);

		Promise.all(
			needed.map(async (attachment) => {
				const url = await getAttachmentDownloadUrl(taskId, attachment.id, {
					inline: true,
				});
				return [attachment.id, url] as const;
			}),
		)
			.then((entries) => {
				if (cancelled) return;
				setPreviewUrls((current) => {
					const merged = { ...current };
					for (const [id, url] of entries) merged[id] = url;
					return merged;
				});
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(
					err instanceof Error ? err.message : 'Failed to load previews',
				);
			})
			.finally(() => {
				if (!cancelled) setPreviewLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [previewMode, loading, attachments, taskId]);

	const handleUpload = async (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) return;
		if (!user?.id) {
			setError('Select a current user before uploading');
			return;
		}
		const validationError = validateAttachmentFile(file);
		if (validationError) {
			setError(validationError);
			if (inputRef.current) inputRef.current.value = '';
			return;
		}

		setUploading(true);
		setError(null);
		try {
			const created = await uploadAttachment(taskId, file, user.id);
			setAttachments((prev) => [...prev, created]);
			if (previewMode && isViewableMime(created.mimeType)) {
				try {
					const url = await getAttachmentDownloadUrl(taskId, created.id, {
						inline: true,
					});
					setPreviewUrls((prev) => ({ ...prev, [created.id]: url }));
				} catch {
					// List still shows; preview effect can retry
				}
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Upload failed');
		} finally {
			setUploading(false);
			if (inputRef.current) inputRef.current.value = '';
		}
	};

	const handleDownload = async (attachment: TaskAttachment) => {
		setBusyId(attachment.id);
		setError(null);
		try {
			const url = await getAttachmentDownloadUrl(taskId, attachment.id);
			window.open(url, '_blank', 'noopener,noreferrer');
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Download failed');
		} finally {
			setBusyId(null);
		}
	};

	const handleDelete = async (attachment: TaskAttachment) => {
		const label = attachment.fileName ?? `attachment #${attachment.id}`;
		if (!window.confirm(`Delete ${label}?`)) return;

		setBusyId(attachment.id);
		setError(null);
		try {
			await deleteAttachment(taskId, attachment.id);
			setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
			setPreviewUrls((prev) => {
				const next = { ...prev };
				delete next[attachment.id];
				return next;
			});
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Delete failed');
		} finally {
			setBusyId(null);
		}
	};

	const viewable = previewMode
		? attachments.filter((a) => isViewableMime(a.mimeType))
		: [];
	const nonViewable = previewMode
		? attachments.filter((a) => !isViewableMime(a.mimeType))
		: attachments;

	const renderListItem = (attachment: TaskAttachment) => {
		const busy = busyId === attachment.id;
		const uploader = attachment.uploadedByName
			? formatShortName(attachment.uploadedByName)
			: null;
		const meta = [
			formatBytes(attachment.fileSizeBytes),
			uploader,
			formatTimeAgo(attachment.createdAt),
		]
			.filter(Boolean)
			.join(' · ');

		return (
			<li key={attachment.id} className='task-attachments-item'>
				<div className='task-attachments-item-main'>
					<Group gap={6} wrap='nowrap' align='center'>
						<Text size='sm' fw={600} lineClamp={1} style={{ flex: 1 }}>
							{attachment.fileName ?? `Attachment #${attachment.id}`}
						</Text>
						<Badge
							size='xs'
							variant='light'
							color={attachment.kind === 'photo' ? 'cyan' : 'gray'}
						>
							{attachment.kind}
						</Badge>
					</Group>
					{meta ? (
						<Text size='xs' c='dimmed' mt={2}>
							{meta}
						</Text>
					) : null}
				</div>
				<Group gap={4} wrap='nowrap'>
					<UnstyledButton
						className='task-attachments-icon-btn'
						aria-label='Download'
						disabled={busy || uploading}
						onClick={() => void handleDownload(attachment)}
					>
						<Download size={16} strokeWidth={2} aria-hidden />
					</UnstyledButton>
					<UnstyledButton
						className='task-attachments-icon-btn task-attachments-icon-btn--danger'
						aria-label='Delete'
						disabled={busy || uploading}
						onClick={() => void handleDelete(attachment)}
					>
						<Trash2 size={16} strokeWidth={2} aria-hidden />
					</UnstyledButton>
				</Group>
			</li>
		);
	};

	const uploadControls = (
		<>
			<input
				ref={inputRef}
				id={inputId}
				type='file'
				accept={attachmentAcceptAttr()}
				className='task-attachments-input'
				disabled={uploading || !user}
				onChange={(e) => void handleUpload(e.target.files)}
			/>
			<Button
				variant='light'
				color='brand'
				leftSection={<Paperclip size={16} />}
				loading={uploading}
				disabled={uploading || !user}
				onClick={() => inputRef.current?.click()}
			>
				Add attachment
			</Button>
		</>
	);

	const errorAlert = error ? (
		<Alert
			color='red'
			title='Attachments'
			withCloseButton
			onClose={() => setError(null)}
		>
			{error}
		</Alert>
	) : null;

	if (previewMode) {
		return (
			<section className='task-view-attachments' aria-label='Attachments'>
				<div className='task-attachments task-attachments--preview'>
					{errorAlert}

					<div className='task-attachments-scroll'>
						{loading ? (
							<Group justify='center' py='sm'>
								<Loader size='sm' />
							</Group>
						) : (
							<>
								{viewable.length > 0 ? (
									<div className='task-attachments-preview-stack'>
										{previewLoading &&
										viewable.some((a) => !previewUrls[a.id]) ? (
											<Group justify='center' py='xs'>
												<Loader size='xs' />
											</Group>
										) : null}
										{viewable.map((attachment) => {
											const url = previewUrls[attachment.id];
											const label =
												attachment.fileName ?? `Attachment #${attachment.id}`;
											const busy = busyId === attachment.id;
											const openViewer = () => {
												if (url) setViewerAttachment(attachment);
											};

											return (
												<figure
													key={attachment.id}
													className='task-attachments-preview'
												>
													{url ? (
														<div
															role='button'
															tabIndex={0}
															className='task-attachments-preview-open'
															aria-label={`View ${label}`}
															onClick={openViewer}
															onKeyDown={(e) => {
																if (e.key === 'Enter' || e.key === ' ') {
																	e.preventDefault();
																	openViewer();
																}
															}}
														>
															{attachment.mimeType.startsWith('image/') ? (
																<img
																	src={url}
																	alt=''
																	className='task-attachments-preview-media'
																/>
															) : isVideoMime(attachment.mimeType) ? (
																<div
																	className='task-attachments-preview-media task-attachments-preview-video'
																	aria-hidden
																>
																	<Film size={40} strokeWidth={1.75} />
																	<span>Video</span>
																</div>
															) : attachment.mimeType === 'application/pdf' ? (
																<PdfPreview
																	url={url}
																	title={label}
																	className='task-attachments-preview-pdf'
																/>
															) : (
																<iframe
																	title={label}
																	src={url}
																	className='task-attachments-preview-text'
																	tabIndex={-1}
																/>
															)}
														</div>
													) : (
														<div className='task-attachments-preview-placeholder'>
															<Loader size='xs' />
														</div>
													)}
													<figcaption className='task-attachments-preview-caption'>
														<button
															type='button'
															className='task-attachments-preview-name'
															onClick={openViewer}
															disabled={!url}
														>
															{label}
														</button>
														<Group gap={4} wrap='nowrap'>
															<UnstyledButton
																className='task-attachments-icon-btn'
																aria-label='Download'
																disabled={busy || uploading}
																onClick={() => void handleDownload(attachment)}
															>
																<Download
																	size={16}
																	strokeWidth={2}
																	aria-hidden
																/>
															</UnstyledButton>
															<UnstyledButton
																className='task-attachments-icon-btn task-attachments-icon-btn--danger'
																aria-label='Delete'
																disabled={busy || uploading}
																onClick={() => void handleDelete(attachment)}
															>
																<Trash2
																	size={16}
																	strokeWidth={2}
																	aria-hidden
																/>
															</UnstyledButton>
														</Group>
													</figcaption>
												</figure>
											);
										})}
									</div>
								) : null}

								{nonViewable.length > 0 ? (
									<ul className='task-attachments-list'>
										{nonViewable.map(renderListItem)}
									</ul>
								) : null}

								{attachments.length === 0 ? (
									<Text size='sm' c='dimmed'>
										No attachments yet
									</Text>
								) : null}
							</>
						)}
					</div>

					<div className='task-attachments-footer'>{uploadControls}</div>
				</div>

				<AttachmentViewer
					opened={viewerAttachment != null}
					url={
						viewerAttachment ? (previewUrls[viewerAttachment.id] ?? null) : null
					}
					mimeType={viewerAttachment?.mimeType ?? ''}
					fileName={
						viewerAttachment?.fileName ??
						(viewerAttachment
							? `Attachment #${viewerAttachment.id}`
							: 'Attachment')
					}
					onClose={() => setViewerAttachment(null)}
				/>
			</section>
		);
	}

	return (
		<Stack gap='sm' className='task-attachments'>
			{errorAlert}

			{loading ? (
				<Group justify='center' py='sm'>
					<Loader size='sm' />
				</Group>
			) : attachments.length === 0 ? (
				<Text size='sm' c='dimmed'>
					No attachments yet
				</Text>
			) : (
				<ul className='task-attachments-list'>
					{attachments.map(renderListItem)}
				</ul>
			)}

			{uploadControls}
		</Stack>
	);
}
