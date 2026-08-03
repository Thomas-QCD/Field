import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
	Alert,
	Box,
	Button,
	Text,
	Textarea,
	TextInput,
	UnstyledButton,
} from '@mantine/core';
import { Camera, ChevronLeft, Film, FileText, PenLine, Upload, X } from 'lucide-react';
import {
	deleteAttachment,
	isVideoMime,
	mediaLibraryAcceptAttr,
	resolveMimeType,
	uploadAttachment,
	validateAttachmentFile,
} from '../api/attachments';
import { createCrewEvent } from '../api/tasks';
import { captureRequiredGeo } from '../captureGeo';
import { MultiShotCamera } from '../components/MultiShotCamera';
import {
	SignaturePad,
	type SignaturePadHandle,
} from '../components/SignaturePad';
import { useCurrentUser } from '../context/CurrentUserContext';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';

type DeliverThumb = {
	attachmentId: number;
	source: 'photo' | 'upload';
	fileName: string;
	mimeType: string;
	/** Object URL for images; null for non-image placeholders. */
	previewUrl: string | null;
};

function ActionButton({
	label,
	icon: Icon,
	onClick,
	disabled,
	active,
}: {
	label: string;
	icon: typeof Camera;
	onClick?: () => void;
	disabled?: boolean;
	active?: boolean;
}) {
	return (
		<button
			type='button'
			className={
				active ? 'task-view-action task-view-action--active' : 'task-view-action'
			}
			onClick={onClick}
			disabled={disabled}
		>
			<Icon size={22} strokeWidth={2} aria-hidden />
			<span>{label}</span>
		</button>
	);
}

function thumbFromFile(
	file: File,
	source: 'photo' | 'upload',
	attachmentId: number,
): DeliverThumb {
	const mimeType = resolveMimeType(file);
	const isImage = mimeType.startsWith('image/');
	return {
		attachmentId,
		source,
		fileName: file.name,
		mimeType,
		previewUrl: isImage ? URL.createObjectURL(file) : null,
	};
}

export function DeliverTaskPage() {
	const { taskId: taskIdParam } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { user } = useCurrentUser();
	const taskId = Number(taskIdParam);

	const [view, setView] = useState<'form' | 'signature'>('form');
	const [recipient, setRecipient] = useState('');
	const [notes, setNotes] = useState('');
	const [signerName, setSignerName] = useState('');
	const [signatureSaved, setSignatureSaved] = useState(false);
	const [thumbs, setThumbs] = useState<DeliverThumb[]>([]);

	const [busy, setBusy] = useState(false);
	const [mediaBusy, setMediaBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mediaError, setMediaError] = useState<string | null>(null);
	const [cameraOpen, setCameraOpen] = useState(false);
	const [signatureDirty, setSignatureDirty] = useState(false);

	const libraryInputRef = useRef<HTMLInputElement>(null);
	const cameraFallbackInputRef = useRef<HTMLInputElement>(null);
	const signaturePadRef = useRef<SignaturePadHandle>(null);
	const thumbsRef = useRef(thumbs);
	thumbsRef.current = thumbs;

	useEffect(() => {
		return () => {
			for (const thumb of thumbsRef.current) {
				if (thumb.previewUrl) URL.revokeObjectURL(thumb.previewUrl);
			}
		};
	}, []);

	const photoCount = thumbs.filter((t) => t.source === 'photo').length;
	const uploadCount = thumbs.filter((t) => t.source === 'upload').length;

	const goBack = () => {
		if (view === 'signature') {
			setView('form');
			setError(null);
			return;
		}
		if (location.key === 'default') {
			navigate(
				Number.isFinite(taskId) && taskId > 0 ? `/task/${taskId}` : '/delivery',
			);
			return;
		}
		navigate(-1);
	};

	useAndroidBackHandler(goBack, true);

	const uploadMediaFiles = async (
		files: File[],
		source: 'photo' | 'upload',
	) => {
		if (files.length === 0) return;
		if (!Number.isFinite(taskId) || taskId <= 0) {
			setMediaError('Invalid task id');
			return;
		}
		if (!user) {
			setMediaError('Select a current user before uploading');
			return;
		}

		setMediaBusy(true);
		setMediaError(null);
		try {
			for (const file of files) {
				const validationError = validateAttachmentFile(file);
				if (validationError) {
					throw new Error(validationError);
				}
				const created = await uploadAttachment(taskId, file, user.id);
				const thumb = thumbFromFile(file, source, created.id);
				setThumbs((prev) => [...prev, thumb]);
			}
		} catch (err: unknown) {
			setMediaError(err instanceof Error ? err.message : 'Upload failed');
		} finally {
			setMediaBusy(false);
			if (libraryInputRef.current) libraryInputRef.current.value = '';
			if (cameraFallbackInputRef.current) {
				cameraFallbackInputRef.current.value = '';
			}
		}
	};

	const removeThumb = async (attachmentId: number) => {
		if (busy || mediaBusy) return;
		if (!Number.isFinite(taskId) || taskId <= 0) return;

		setMediaBusy(true);
		setMediaError(null);
		try {
			await deleteAttachment(taskId, attachmentId);
			setThumbs((prev) => {
				const removed = prev.find((t) => t.attachmentId === attachmentId);
				if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
				return prev.filter((t) => t.attachmentId !== attachmentId);
			});
		} catch (err: unknown) {
			setMediaError(
				err instanceof Error ? err.message : 'Failed to remove attachment',
			);
		} finally {
			setMediaBusy(false);
		}
	};

	const handleSaveSignature = async () => {
		if (busy || mediaBusy) return;
		if (!Number.isFinite(taskId) || taskId <= 0) {
			setError('Invalid task id');
			return;
		}
		if (!user) {
			setError('Select a current user before saving a signature');
			return;
		}
		const name = signerName.trim();
		if (!name) {
			setError('Enter the signer name');
			return;
		}
		const pad = signaturePadRef.current;
		if (!pad || pad.isEmpty()) {
			setError('Draw a signature before saving');
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const safe = name.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'signer';
			const file = await pad.toPngFile(`signature-${safe}.png`);
			await uploadAttachment(taskId, file, user.id);
			setSignatureSaved(true);
			setView('form');
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to save signature');
		} finally {
			setBusy(false);
		}
	};

	const handleSaveDelivery = async () => {
		if (busy || mediaBusy) return;
		if (!Number.isFinite(taskId) || taskId <= 0) {
			setError('Invalid task id');
			return;
		}
		if (!user) {
			setError('Select a user before completing delivery');
			return;
		}

		const parts = [
			recipient.trim() ? `Recipient: ${recipient.trim()}` : '',
			signerName.trim() ? `Signed by: ${signerName.trim()}` : '',
			notes.trim(),
		].filter(Boolean);

		setBusy(true);
		setError(null);
		try {
			const geo = await captureRequiredGeo();
			await createCrewEvent(taskId, {
				userId: user.id,
				eventType: 'ended',
				outcome: 'Completed',
				notes: parts.join('\n\n'),
				latitude: geo.latitude,
				longitude: geo.longitude,
				accuracyMeters: geo.accuracyMeters,
				recordedAt: geo.recordedAt,
			});
			navigate(`/task/${taskId}`, { replace: true });
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to complete delivery',
			);
		} finally {
			setBusy(false);
		}
	};

	if (view === 'signature') {
		return (
			<Box className='task-view-page complete-task-page deliver-task-page deliver-signature-page'>
				<header className='task-view-header'>
					<UnstyledButton
						onClick={goBack}
						aria-label='Back'
						className='task-view-back'
						disabled={busy}
					>
						<ChevronLeft size={28} strokeWidth={2} aria-hidden />
					</UnstyledButton>
					<Text fw={700} fz='lg' lineClamp={1} className='task-view-title'>
						Signature
					</Text>
					<span className='task-view-type' aria-hidden />
				</header>

				<div className='deliver-signature-body'>
					<label className='complete-task-label' htmlFor='deliver-signer-name'>
						Name
					</label>
					<TextInput
						id='deliver-signer-name'
						value={signerName}
						onChange={(e) => setSignerName(e.currentTarget.value)}
						placeholder='Recipient name'
						disabled={busy}
						size='md'
					/>

					<label className='complete-task-label'>Signature</label>
					<div className='deliver-signature-pad-wrap'>
						<SignaturePad
							ref={signaturePadRef}
							className='deliver-signature-pad'
							onStrokeEnd={() => setSignatureDirty(true)}
						/>
					</div>

					{error ? (
						<Alert color='red' title='Could not save'>
							{error}
						</Alert>
					) : null}
				</div>

				<div className='complete-task-footer'>
					<Button
						fullWidth
						size='md'
						color='brand'
						loading={busy}
						disabled={!signatureDirty && !signerName.trim()}
						onClick={() => void handleSaveSignature()}
					>
						Save
					</Button>
				</div>
			</Box>
		);
	}

	return (
		<Box className='task-view-page complete-task-page deliver-task-page'>
			{cameraOpen ? (
				<MultiShotCamera
					onCancel={() => setCameraOpen(false)}
					onUnavailable={() => {
						setCameraOpen(false);
						window.setTimeout(() => {
							cameraFallbackInputRef.current?.click();
						}, 0);
					}}
					onComplete={(files) => {
						setCameraOpen(false);
						void uploadMediaFiles(files, 'photo');
					}}
				/>
			) : null}
			<input
				ref={cameraFallbackInputRef}
				type='file'
				accept='image/*'
				capture='environment'
				hidden
				aria-hidden
				tabIndex={-1}
				disabled={mediaBusy || busy}
				onChange={(e) =>
					void uploadMediaFiles(Array.from(e.target.files ?? []), 'photo')
				}
			/>
			<input
				ref={libraryInputRef}
				type='file'
				accept={mediaLibraryAcceptAttr()}
				multiple
				hidden
				aria-hidden
				tabIndex={-1}
				disabled={mediaBusy || busy}
				onChange={(e) =>
					void uploadMediaFiles(Array.from(e.target.files ?? []), 'upload')
				}
			/>

			<header className='task-view-header'>
				<UnstyledButton
					onClick={goBack}
					aria-label='Back'
					className='task-view-back'
					disabled={busy || mediaBusy}
				>
					<ChevronLeft size={28} strokeWidth={2} aria-hidden />
				</UnstyledButton>
				<Text fw={700} fz='lg' lineClamp={1} className='task-view-title'>
					Deliver Items
				</Text>
				<span className='task-view-type' aria-hidden />
			</header>

			<div className='complete-task-body'>
				<label className='complete-task-label' htmlFor='deliver-recipient'>
					Recipient
				</label>
				<TextInput
					id='deliver-recipient'
					value={recipient}
					onChange={(e) => setRecipient(e.currentTarget.value)}
					placeholder='Who received the delivery'
					disabled={busy || mediaBusy}
					size='md'
				/>

				<label className='complete-task-label' htmlFor='deliver-notes'>
					Notes
				</label>
				<Textarea
					id='deliver-notes'
					value={notes}
					onChange={(e) => setNotes(e.currentTarget.value)}
					minRows={5}
					autosize
					disabled={busy || mediaBusy}
					classNames={{ input: 'complete-task-notes-input' }}
				/>

				<div
					className='deliver-task-actions'
					role='group'
					aria-label='Delivery proof actions'
				>
					<ActionButton
						label={signatureSaved ? 'Signed' : 'Signature'}
						icon={PenLine}
						active={signatureSaved}
						disabled={busy || mediaBusy}
						onClick={() => {
							setError(null);
							setSignatureDirty(false);
							if (!signerName.trim() && recipient.trim()) {
								setSignerName(recipient.trim());
							}
							setView('signature');
						}}
					/>
					<ActionButton
						label={photoCount > 0 ? `Photo (${photoCount})` : 'Photo'}
						icon={Camera}
						active={photoCount > 0}
						disabled={busy || mediaBusy}
						onClick={() => {
							setMediaError(null);
							setCameraOpen(true);
						}}
					/>
					<ActionButton
						label={uploadCount > 0 ? `Upload (${uploadCount})` : 'Upload'}
						icon={Upload}
						active={uploadCount > 0}
						disabled={busy || mediaBusy}
						onClick={() => libraryInputRef.current?.click()}
					/>
				</div>

				{thumbs.length > 0 ? (
					<ul className='deliver-task-thumbs' aria-label='Uploaded media'>
						{thumbs.map((thumb) => (
							<li key={thumb.attachmentId} className='deliver-task-thumb'>
								{thumb.previewUrl ? (
									<img src={thumb.previewUrl} alt={thumb.fileName} />
								) : (
									<span
										className='deliver-task-thumb-placeholder'
										title={thumb.fileName}
									>
										{isVideoMime(thumb.mimeType) ? (
											<Film size={20} strokeWidth={2} aria-hidden />
										) : (
											<FileText size={20} strokeWidth={2} aria-hidden />
										)}
									</span>
								)}
								<button
									type='button'
									className='deliver-task-thumb-remove'
									aria-label={`Remove ${thumb.fileName}`}
									disabled={busy || mediaBusy}
									onClick={(e) => {
										e.stopPropagation();
										void removeThumb(thumb.attachmentId);
									}}
								>
									<X size={12} strokeWidth={2.5} aria-hidden />
								</button>
							</li>
						))}
					</ul>
				) : null}

				{error ? (
					<Alert color='red' title='Could not save'>
						{error}
					</Alert>
				) : null}

				{mediaError ? (
					<Alert color='red' title='Upload failed'>
						{mediaError}
					</Alert>
				) : null}
			</div>

			<div className='complete-task-footer'>
				<Button
					fullWidth
					size='md'
					color='brand'
					loading={busy}
					disabled={mediaBusy}
					onClick={() => void handleSaveDelivery()}
				>
					Save delivery
				</Button>
			</div>
		</Box>
	);
}
