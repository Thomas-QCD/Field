import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
	Camera,
	CheckCircle,
	ChevronLeft,
	Image,
	MessageSquare,
	Navigation,
	Package,
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
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { TaskAttachments } from '../components/TaskAttachments';
import { TaskDescHtml } from '../components/TaskDescHtml';
import { TaskHistory } from '../components/TaskHistory';
import { captureRequiredGeo } from '../captureGeo';
import { TaskStartedCrew } from '../components/TaskStartedCrew';
import { TaskStatusBadge } from '../components/TaskStatusBadge';
import { useCurrentUser } from '../context/CurrentUserContext';
import { getDeliveryMode } from '../deliveryMode';
import { useDocumentTitle } from '../documentTitle';
import { isEmptyTaskDesc } from '../taskDescHtml';
import { formatShortName } from '../formatName';
import { formatShortDateTimeWithAgo } from '../formatTime';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { useFieldPullToRefresh } from '../hooks/useFieldPullToRefresh';
import { openMapsNavigation } from '../openMapsNavigation';
import { AG_GRID_MOBILE_MQ } from '../agGridDefaults';
import type {
	TaskAttachment,
	TaskCompletionNote,
	TaskContact,
	TaskDetail,
	TaskStatus,
} from '../types/task';

function formatWindow(start: string | null, end: string | null): string {
	return `${formatShortDateTimeWithAgo(start)} – ${formatShortDateTimeWithAgo(end)}`;
}

function formatDateTime(value: string | null): string {
	if (!value) return '—';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

function CompletionCallout({
	outcome,
	entries,
}: {
	outcome: 'Completed' | 'Failed';
	entries: TaskCompletionNote[];
}) {
	return (
		<div
			className={
				outcome === 'Failed'
					? 'task-view-callout task-view-callout--failed'
					: 'task-view-callout'
			}
		>
			{entries.map((entry) => (
				<div key={entry.userId}>
					{entry.notes?.trim() ? (
						<p className='task-view-callout-notes'>{entry.notes.trim()}</p>
					) : null}
					<p className='task-view-callout-meta'>
						{outcome} at {formatDateTime(entry.updatedAt || entry.createdAt)} by{' '}
						{formatShortName(entry.displayName)}
					</p>
				</div>
			))}
		</div>
	);
}

/** Cancelled / outcome / in-progress callouts, mirroring the desktop task view. */
function TaskViewBanners({ task }: { task: TaskDetail }) {
	const completedEntries =
		task.completionNotes?.filter((n) => n.outcome === 'Completed') ?? [];
	const failedEntries =
		task.completionNotes?.filter((n) => n.outcome === 'Failed') ?? [];

	return (
		<div className='task-view-banners'>
			{task.status === 'Cancelled' && task.cancelledAt ? (
				<Alert color='orange' title='Cancelled'>
					Scheduled for permanent removal on{' '}
					{formatDateTime(
						new Date(
							new Date(task.cancelledAt).getTime() + 7 * 24 * 60 * 60 * 1000,
						).toISOString(),
					)}
					.
				</Alert>
			) : null}

			{completedEntries.length > 0 ? (
				<CompletionCallout outcome='Completed' entries={completedEntries} />
			) : null}

			{failedEntries.length > 0 ? (
				<CompletionCallout outcome='Failed' entries={failedEntries} />
			) : null}

			<TaskStartedCrew status={task.status} crewMembers={task.crewMembers} />
		</div>
	);
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
					<span>{contact.name}</span>
					{contact.isPoc ? (
						<span className='task-view-contact-poc'>POC</span>
					) : null}
				</div>
				{contact.title.trim() ? (
					<div className='task-view-contact-title'>{contact.title.trim()}</div>
				) : null}
				{phone ? (
					<a className='task-view-contact-email' href={`tel:${phone}`}>
						{phone}
					</a>
				) : contact.email ? (
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
	/** Keep the disabled look but still receive presses (e.g. to toast a reason). */
	explainDisabled,
}: {
	label: string;
	icon: typeof Navigation;
	onClick?: () => void;
	disabled?: boolean;
	explainDisabled?: boolean;
}) {
	const softDisabled = Boolean(disabled && explainDisabled);
	return (
		<button
			type='button'
			className='task-view-action'
			onClick={onClick}
			disabled={disabled && !softDisabled}
			aria-disabled={softDisabled || undefined}
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

/** Why Start / Load is blocked, or null when the action is allowed. */
function getStartBlockedReason(
	task: TaskDetail,
	me: TaskDetail['crewMembers'][number] | undefined,
	isDelivery: boolean,
	busy: boolean,
): string | null {
	if (busy) return 'Please wait…';
	if (!me) return "You're not assigned to this task";
	// Completed / Undetermined can be reopened by starting again; other terminals cannot.
	if (task.status === 'Completed' || task.status === 'Undetermined') {
		return null;
	}
	if (isTerminalStatus(task.status)) {
		return `This task is ${task.status} and can't be started`;
	}
	if (me.startedAt) {
		return isDelivery
			? 'Items already loaded'
			: "You've already started this task";
	}
	return null;
}

/** Why End / Deliver is blocked, or null when the action is allowed. */
function getEndBlockedReason(
	task: TaskDetail,
	me: TaskDetail['crewMembers'][number] | undefined,
	isDelivery: boolean,
	busy: boolean,
): string | null {
	if (busy) return 'Please wait…';
	if (!me) return "You're not assigned to this task";
	if (isTerminalStatus(task.status)) {
		return `This task is already ${task.status}`;
	}
	if (!me.startedAt) {
		return isDelivery ? 'Load the items first' : 'Start the task first';
	}
	if (me.endedAt) {
		return isDelivery
			? 'You already delivered the items'
			: "You've already ended this task";
	}
	return null;
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
	const [toast, setToast] = useState<{
		message: string;
		id: number;
	} | null>(null);
	const address = task.destinationAddress.trim();
	const destinationName = task.destinationAddressName.trim();
	const canNavigate = Boolean(address);
	const isDelivery = task.taskType === 'Delivery';

	const me = userId ? task.crewMembers.find((m) => m.id === userId) : undefined;
	const startBlockedReason = getStartBlockedReason(
		task,
		me,
		isDelivery,
		eventBusy || mediaBusy,
	);
	const canStart = startBlockedReason == null;
	const endBlockedReason = getEndBlockedReason(
		task,
		me,
		isDelivery,
		eventBusy || mediaBusy,
	);
	const canEnd = endBlockedReason == null;

	useEffect(() => {
		if (!toast) return;
		const id = window.setTimeout(() => setToast(null), 2800);
		return () => window.clearTimeout(id);
	}, [toast]);

	const showToast = (message: string) => {
		setToast({ message, id: Date.now() });
	};

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
			(task.status === 'Completed' || task.status === 'Undetermined')
		) {
			const nextStatus = isDelivery ? 'Loaded' : 'In Progress';
			const action = isDelivery ? 'Loading items' : 'Starting it';
			const ok = window.confirm(
				`This task is ${task.status.toLowerCase()}. ${action} will change the task to ${nextStatus}. Continue?`,
			);
			if (!ok) return;
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
					label={isDelivery ? 'Load items' : 'Start task'}
					icon={isDelivery ? Package : Play}
					disabled={!canStart}
					explainDisabled={!canStart}
					onClick={() => {
						if (startBlockedReason) {
							showToast(startBlockedReason);
							return;
						}
						void logCrewEvent('started');
					}}
				/>
				<ActionButton
					label={isDelivery ? 'Deliver items' : 'End task'}
					icon={CheckCircle}
					disabled={!canEnd}
					explainDisabled={!canEnd}
					onClick={() => {
						if (endBlockedReason) {
							showToast(endBlockedReason);
							return;
						}
						onEndTask();
					}}
				/>
				<PhotoActionButton
					disabled={eventBusy || mediaBusy}
					onTakePhoto={openCamera}
					onPickLibrary={openLibrary}
				/>
			</div>

			<TaskViewBanners task={task} />

			{toast ? (
				<div
					key={toast.id}
					className='task-view-toast'
					role='status'
					aria-live='polite'
				>
					{toast.message}
				</div>
			) : null}

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

			<div className='task-view-section'>
				{task.jobTitle?.trim() ? (
					<p className='task-view-job-title'>{task.jobTitle.trim()}</p>
				) : null}
				<p className='task-view-address'>{address || 'No address'}</p>
				{destinationName ? (
					<p className='task-view-destination-name'>{destinationName}</p>
				) : null}

				<p className='task-view-window'>
					{formatWindow(task.windowStartAt, task.windowEndAt)}
				</p>
			</div>

			<div className='task-view-section'>
				<div className='task-view-meta'>
					<div className='task-view-field'>
						<span className='task-view-field-label'>Status</span>
						<TaskStatusBadge status={task.status} />
					</div>
					<Field
						label='Created by'
						value={
							task.createdByName ? formatShortName(task.createdByName) : ''
						}
					/>
					<Field
						label='Guys'
						value={task.crewSize != null ? String(task.crewSize) : ''}
					/>
					<Field
						label='Hours'
						value={
							task.estimatedHours != null ? String(task.estimatedHours) : ''
						}
					/>
					<Field
						label='Can start early'
						value={task.canStartEarly ? 'Yes' : 'No'}
					/>
					<Field
						label='Time specific'
						value={task.isTimeSpecific ? 'Yes' : 'No'}
					/>
					<Field label='Urgent' value={task.isUrgent ? 'Yes' : 'No'} />
					<Field
						label='Equipment'
						value={
							task.equipment.length > 0 ? task.equipment.join(' · ') : ''
						}
					/>
				</div>
			</div>

			{!isEmptyTaskDesc(task.description) ? (
				<div className='task-view-section'>
					<TaskDescHtml
						value={task.description}
						className='task-view-description'
					/>
				</div>
			) : null}

			<div className='task-view-section'>
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
			</div>

			<div className='task-view-section'>
				<span className='task-view-field-label'>Crew</span>
				{task.crewMembers.length === 0 ? (
					<span className='task-view-field-value'>Unassigned</span>
				) : (
					<div className='task-view-crew'>
						{task.crewMembers.map((member) => (
							<div
								key={member.id}
								className={
									member.isLead
										? 'task-view-crew-member task-view-crew-member--lead'
										: 'task-view-crew-member'
								}
							>
								<span className='task-view-crew-member-name'>
									{formatShortName(member.displayName)}
								</span>
								<span className='task-view-crew-member-role'>
									{member.isLead ? 'Lead' : 'Sub'}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			<div className='task-view-section'>
				<TaskAttachments
					taskId={task.id}
					initialAttachments={task.attachments}
					variant='plain'
				/>
			</div>

			<div className='task-view-section'>
				<TaskHistory
					taskId={task.id}
					refreshKey={`${task.status}:${task.updatedAt}`}
				/>
			</div>
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

	useDocumentTitle(
		task?.externalKey ? `#${task.externalKey}` : task ? 'Task' : null,
	);

	const goBack = () => {
		// First load / deep link has no in-app history to pop.
		if (location.key === 'default') {
			navigate(getDeliveryMode() ? '/delivery' : '/my-tasks');
			return;
		}
		navigate(-1);
	};

	useAndroidBackHandler(goBack, true);

	const refreshTask = useCallback(
		async (signal?: AbortSignal) => {
			if (!Number.isFinite(taskId) || taskId <= 0) {
				setTask(null);
				setError('Invalid task id');
				return;
			}
			setError(null);
			try {
				const next = await getTask(taskId, signal);
				if (!signal?.aborted) setTask(next);
			} catch (err: unknown) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load task');
			}
		},
		[taskId],
	);

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

		void refreshTask(controller.signal).finally(() => {
			if (!controller.signal.aborted) setLoading(false);
		});

		return () => controller.abort();
	}, [taskId, refreshTask]);

	const isMobile = useMediaQuery(AG_GRID_MOBILE_MQ);
	const {
		scrollRef: ptrScrollRef,
		pullPosition,
		isRefreshing: ptrRefreshing,
	} = useFieldPullToRefresh({
		enabled: Boolean(isMobile),
		onRefresh: refreshTask,
	});

	const handleCrewEvent = async (eventType: CrewEventType) => {
		if (!task || !user) {
			throw new Error('Select a user before starting or ending a task');
		}
		const geo = await captureRequiredGeo();
		const { event, task: updated } = await createCrewEvent(task.id, {
			userId: user.id,
			eventType,
			latitude: geo.latitude,
			longitude: geo.longitude,
			accuracyMeters: geo.accuracyMeters,
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
		<Box ref={ptrScrollRef} className='task-view-page'>
			{isMobile ? (
				<PullToRefreshIndicator
					pullPosition={pullPosition}
					isRefreshing={ptrRefreshing}
				/>
			) : null}
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

			{loading && !task ? (
				<Group justify='center' py='xl'>
					<Loader size='sm' />
				</Group>
			) : task ? (
				<TaskViewBody
					task={task}
					userId={user?.id ?? null}
					onCrewEvent={handleCrewEvent}
					onEndTask={() =>
						navigate(
							task.taskType === 'Delivery'
								? `/task/${task.id}/deliver`
								: `/task/${task.id}/complete`,
						)
					}
					onAttachmentsChange={(attachments) =>
						setTask((prev) => (prev ? { ...prev, attachments } : prev))
					}
				/>
			) : error ? (
				<Alert color='red' title='Could not load task'>
					{error}
				</Alert>
			) : null}
		</Box>
	);
}
