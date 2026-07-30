import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import {
	Camera,
	CheckCircle,
	ChevronLeft,
	Image,
	MessageSquare,
	Navigation,
	Phone,
	Play,
} from 'lucide-react';
import { getTask, createCrewEvent, type CrewEventType } from '../api/tasks';
import {
	listAttachments,
	mediaLibraryAcceptAttr,
	uploadAttachment,
	validateAttachmentFile,
} from '../api/attachments';
import { MultiShotCamera } from '../components/MultiShotCamera';
import { TaskAttachments } from '../components/TaskAttachments';
import { TaskStatusBadge } from '../components/TaskStatusBadge';
import { useCurrentUser } from '../context/CurrentUserContext';
import { getDeliveryMode } from '../deliveryMode';
import { formatShortName } from '../formatName';
import { formatShortDateTimeWithAgo } from '../formatTime';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { openMapsNavigation } from '../openMapsNavigation';
import type {
	TaskAttachment,
	TaskContact,
	TaskDetail,
	TaskStatus,
} from '../types/task';

function formatWindow(start: string | null, end: string | null): string {
	return `${formatShortDateTimeWithAgo(start)} – ${formatShortDateTimeWithAgo(end)}`;
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className='task-view-field'>
			<span className='task-view-field-label'>{label}</span>
			<span className='task-view-field-value'>{value || '—'}</span>
		</div>
	);
}

function ContactBlock({ contact }: { contact: TaskContact }) {
	const phone = contact.phone.trim();
	const canCall = Boolean(phone);

	return (
		<div
			className={
				contact.isPoc
					? 'task-view-contact task-view-contact--poc'
					: 'task-view-contact'
			}
		>
			<div className='task-view-contact-info'>
				<div className='task-view-contact-name'>
					<span>{formatShortName(contact.name)}</span>
					{contact.isPoc ? (
						<span className='task-view-contact-poc'>POC</span>
					) : null}
				</div>
				{contact.title.trim() ? (
					<div className='task-view-contact-title'>{contact.title.trim()}</div>
				) : null}
				{contact.email ? (
					<a
						className='task-view-contact-email'
						href={`mailto:${contact.email}`}
					>
						{contact.email}
					</a>
				) : null}
			</div>
			<div className='task-view-contact-actions'>
				<button
					type='button'
					className='task-view-contact-btn'
					disabled={!canCall}
					onClick={() => {
						window.location.href = `sms:${phone}`;
					}}
				>
					<MessageSquare size={16} strokeWidth={2} aria-hidden />
					Text
				</button>
				<button
					type='button'
					className='task-view-contact-btn'
					disabled={!canCall}
					onClick={() => {
						window.location.href = `tel:${phone}`;
					}}
				>
					<Phone size={16} strokeWidth={2} aria-hidden />
					Call
				</button>
			</div>
		</div>
	);
}

function ActionButton({
	label,
	icon: Icon,
	onClick,
	disabled,
}: {
	label: string;
	icon: typeof Navigation;
	onClick?: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type='button'
			className='task-view-action'
			onClick={onClick}
			disabled={disabled}
		>
			<Icon size={22} strokeWidth={2} aria-hidden />
			<span>{label}</span>
		</button>
	);
}

function PhotoActionButton({
	disabled,
	onTakePhoto,
	onPickLibrary,
}: {
	disabled?: boolean;
	onTakePhoto: () => void;
	onPickLibrary: () => void;
}) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		const onPointerDown = (event: PointerEvent) => {
			if (!wrapRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	return (
		<div
			ref={wrapRef}
			className={
				open ? 'task-view-photo task-view-photo--open' : 'task-view-photo'
			}
		>
			<button
				type='button'
				className='task-view-action'
				aria-expanded={open}
				aria-haspopup='dialog'
				disabled={disabled}
				onClick={() => setOpen((prev) => !prev)}
			>
				<Camera size={22} strokeWidth={2} aria-hidden />
				<span>Photo</span>
			</button>
			{open ? (
				<div
					className='task-view-photo-popover'
					role='dialog'
					aria-label='Photo options'
				>
					<button
						type='button'
						className='task-view-photo-option'
						onClick={() => {
							setOpen(false);
							onTakePhoto();
						}}
					>
						<Camera size={22} strokeWidth={2} aria-hidden />
						<span>Camera</span>
					</button>
					<button
						type='button'
						className='task-view-photo-option'
						onClick={() => {
							setOpen(false);
							onPickLibrary();
						}}
					>
						<Image size={22} strokeWidth={2} aria-hidden />
						<span>Library</span>
					</button>
				</div>
			) : null}
		</div>
	);
}

function isTerminalStatus(status: TaskStatus): boolean {
	return (
		status === 'Completed' ||
		status === 'Failed' ||
		status === 'Undetermined' ||
		status === 'Cancelled'
	);
}

async function captureGeo(): Promise<{
	latitude?: number;
	longitude?: number;
	accuracyMeters?: number;
	recordedAt: string;
}> {
	const recordedAt = new Date().toISOString();
	if (!navigator.geolocation) return { recordedAt };

	try {
		const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 5000,
				maximumAge: 30_000,
			});
		});
		return {
			latitude: pos.coords.latitude,
			longitude: pos.coords.longitude,
			accuracyMeters: pos.coords.accuracy,
			recordedAt,
		};
	} catch {
		return { recordedAt };
	}
}

function TaskViewBody({
	task,
	userId,
	onCrewEvent,
	onEndTask,
	onAttachmentsChange,
}: {
	task: TaskDetail;
	userId: string | null;
	onCrewEvent: (eventType: CrewEventType) => Promise<void>;
	onEndTask: () => void;
	onAttachmentsChange: (attachments: TaskAttachment[]) => void;
}) {
	const libraryInputRef = useRef<HTMLInputElement>(null);
	const cameraFallbackInputRef = useRef<HTMLInputElement>(null);
	const [eventBusy, setEventBusy] = useState(false);
	const [eventError, setEventError] = useState<string | null>(null);
	const [mediaBusy, setMediaBusy] = useState(false);
	const [mediaError, setMediaError] = useState<string | null>(null);
	const [cameraOpen, setCameraOpen] = useState(false);
	const address = task.destinationAddress.trim();
	const destinationName = task.destinationAddressName.trim();
	const canNavigate = Boolean(address);

	const me = userId ? task.crewMembers.find((m) => m.id === userId) : undefined;
	const canReopenCompleted = task.status === 'Completed';
	const canStart =
		Boolean(me) &&
		(canReopenCompleted || (!me?.startedAt && !isTerminalStatus(task.status)));
	const canEnd =
		Boolean(me?.startedAt) && !me?.endedAt && !isTerminalStatus(task.status);

	const openCamera = () => {
		setCameraOpen(true);
	};

	const openLibrary = () => {
		libraryInputRef.current?.click();
	};

	const uploadMediaFiles = async (files: File[]) => {
		if (files.length === 0) return;
		if (!userId) {
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
				await uploadAttachment(task.id, file, userId);
			}
			const next = await listAttachments(task.id);
			onAttachmentsChange(next);
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

	const logCrewEvent = async (eventType: CrewEventType) => {
		if (eventBusy) return;
		if (
			eventType === 'started' &&
			task.status === 'Completed' &&
			!window.confirm(
				'This task is completed. Starting it will remove the completed status and change the task to In Progress. Continue?',
			)
		) {
			return;
		}
		setEventBusy(true);
		setEventError(null);
		try {
			await onCrewEvent(eventType);
		} catch (err: unknown) {
			setEventError(
				err instanceof Error ? err.message : 'Failed to update check-in',
			);
		} finally {
			setEventBusy(false);
		}
	};

	return (
		<div className='task-view-body'>
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
						void uploadMediaFiles(files);
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
				disabled={mediaBusy}
				onChange={(e) =>
					void uploadMediaFiles(Array.from(e.target.files ?? []))
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
				disabled={mediaBusy}
				onChange={(e) =>
					void uploadMediaFiles(Array.from(e.target.files ?? []))
				}
			/>
			<div className='task-view-actions' role='group' aria-label='Task actions'>
				<ActionButton
					label='Navigate'
					icon={Navigation}
					disabled={!canNavigate || eventBusy || mediaBusy}
					onClick={() => openMapsNavigation(address)}
				/>
				<ActionButton
					label='Start task'
					icon={Play}
					disabled={!canStart || eventBusy || mediaBusy}
					onClick={() => void logCrewEvent('started')}
				/>
				<ActionButton
					label='End task'
					icon={CheckCircle}
					disabled={!canEnd || eventBusy || mediaBusy}
					onClick={onEndTask}
				/>
				<PhotoActionButton
					disabled={eventBusy || mediaBusy}
					onTakePhoto={openCamera}
					onPickLibrary={openLibrary}
				/>
			</div>

			{eventError ? (
				<Alert color='red' title='Check-in failed'>
					{eventError}
				</Alert>
			) : null}

			{mediaError ? (
				<Alert color='red' title='Upload failed'>
					{mediaError}
				</Alert>
			) : null}

			<p className='task-view-address'>{address || 'No address'}</p>
			{destinationName ? (
				<p className='task-view-destination-name'>{destinationName}</p>
			) : null}

			<p className='task-view-window'>
				{formatWindow(task.windowStartAt, task.windowEndAt)}
			</p>

			<div className='task-view-row'>
				<div className='task-view-field'>
					<span className='task-view-field-label'>Status</span>
					<TaskStatusBadge status={task.status} />
				</div>
				<Field
					label='Created by'
					value={task.createdByName ? formatShortName(task.createdByName) : ''}
				/>
			</div>

			<div className='task-view-field'>
				<span className='task-view-field-label'>Contacts</span>
				{task.contacts.length === 0 ? (
					<span className='task-view-field-value'>None</span>
				) : (
					<div className='task-view-contacts'>
						{task.contacts.map((contact) => (
							<ContactBlock key={contact.id} contact={contact} />
						))}
					</div>
				)}
			</div>

			<Field
				label='Crew'
				value={
					task.crewMembers.length
						? task.crewMembers
								.map((m) => formatShortName(m.displayName))
								.join(', ')
						: 'Unassigned'
				}
			/>

			{task.crewSize != null || task.estimatedHours != null ? (
				<div className='task-view-row'>
					{task.crewSize != null ? (
						<Field label='Guys' value={String(task.crewSize)} />
					) : null}
					{task.estimatedHours != null ? (
						<Field label='Hours' value={String(task.estimatedHours)} />
					) : null}
				</div>
			) : null}

			<div className='task-view-row'>
				<Field
					label='Can start early'
					value={task.canStartEarly ? 'Yes' : 'No'}
				/>
				<Field
					label='Time specific'
					value={task.isTimeSpecific ? 'Yes' : 'No'}
				/>
			</div>

			{(task.completionNotes?.length ?? 0) > 0 ? (
				task.completionNotes.map((entry) => {
					const at = entry.updatedAt || entry.createdAt;
					const d = at ? new Date(at) : null;
					const when =
						d && !Number.isNaN(d.getTime())
							? d.toLocaleString(undefined, {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: '2-digit',
								})
							: '—';
					const label = entry.outcome === 'Failed' ? 'Failed' : 'Completed';
					const who = formatShortName(entry.displayName);
					return (
						<div key={entry.userId} className='task-view-field'>
							<span className='task-view-field-label'>
								{entry.outcome === 'Failed'
									? 'Failed reason'
									: 'Completed notes'}
							</span>
							<span className='task-view-field-value'>
								{entry.notes?.trim() || '—'}
							</span>
							<span className='task-view-completion-meta'>
								{label} at {when} by {who}
							</span>
						</div>
					);
				})
			) : task.status === 'Failed' ? (
				<Field label='Failed reason' value={task.failedReason ?? ''} />
			) : task.status === 'Completed' || task.completedNotes ? (
				<Field label='Completed notes' value={task.completedNotes ?? ''} />
			) : task.failedReason ? (
				<Field label='Failed reason' value={task.failedReason} />
			) : null}

			{task.description ? (
				<p className='task-view-description'>{task.description}</p>
			) : null}

			<TaskAttachments
				taskId={task.id}
				initialAttachments={task.attachments}
				variant='plain'
			/>
		</div>
	);
}

export function TaskViewPage() {
	const { taskId: taskIdParam } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { user } = useCurrentUser();
	const taskId = Number(taskIdParam);

	const [task, setTask] = useState<TaskDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const goBack = () => {
		// First load / deep link has no in-app history to pop.
		if (location.key === 'default') {
			navigate(getDeliveryMode() ? '/delivery' : '/my-tasks');
			return;
		}
		navigate(-1);
	};

	useAndroidBackHandler(goBack, true);

	useEffect(() => {
		if (!Number.isFinite(taskId) || taskId <= 0) {
			setTask(null);
			setError('Invalid task id');
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setTask(null);

		getTask(taskId, controller.signal)
			.then((next) => {
				if (!controller.signal.aborted) setTask(next);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load task');
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [taskId]);

	const handleCrewEvent = async (eventType: CrewEventType) => {
		if (!task || !user) {
			throw new Error('Select a user before starting or ending a task');
		}
		const geo = await captureGeo();
		const { event, task: updated } = await createCrewEvent(task.id, {
			userId: user.id,
			eventType,
			latitude: geo.latitude ?? null,
			longitude: geo.longitude ?? null,
			accuracyMeters: geo.accuracyMeters ?? null,
			recordedAt: geo.recordedAt,
		});
		setTask((prev) =>
			prev
				? {
						...prev,
						status: updated.status,
						completedAt: updated.completedAt,
						completedNotes: updated.completedNotes,
						failedReason: updated.failedReason,
						completionNotes: updated.completionNotes ?? prev.completionNotes,
						crewMembers: prev.crewMembers.map((m) =>
							m.id === user.id
								? {
										...m,
										startedAt:
											eventType === 'started' ? event.recordedAt : m.startedAt,
										endedAt:
											eventType === 'started'
												? null
												: eventType === 'ended'
													? event.recordedAt
													: m.endedAt,
									}
								: m,
						),
					}
				: prev,
		);
	};

	return (
		<Box className='task-view-page'>
			<header className='task-view-header'>
				<UnstyledButton
					onClick={goBack}
					aria-label='Back'
					className='task-view-back'
				>
					<ChevronLeft size={28} strokeWidth={2} aria-hidden />
				</UnstyledButton>
				<Text fw={700} fz='lg' lineClamp={1} className='task-view-title'>
					{task?.externalKey
						? `#${task.externalKey}`
						: Number.isFinite(taskId) && taskId > 0
							? `Task #${taskId}`
							: 'Task'}
				</Text>
				{task ? (
					<Text fw={800} fz='lg' className='task-view-type'>
						{task.taskType}
					</Text>
				) : (
					<span className='task-view-type' aria-hidden />
				)}
			</header>

			{loading ? (
				<Group justify='center' py='xl'>
					<Loader size='sm' />
				</Group>
			) : error ? (
				<Alert color='red' title='Could not load task'>
					{error}
				</Alert>
			) : task ? (
				<TaskViewBody
					task={task}
					userId={user?.id ?? null}
					onCrewEvent={handleCrewEvent}
					onEndTask={() => navigate(`/task/${task.id}/complete`)}
					onAttachmentsChange={(attachments) =>
						setTask((prev) => (prev ? { ...prev, attachments } : prev))
					}
				/>
			) : null}
		</Box>
	);
}
