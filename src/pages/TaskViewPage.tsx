import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import {
	Camera,
	CheckCircle,
	ChevronLeft,
	MessageSquare,
	Navigation,
	Phone,
	Play,
} from 'lucide-react';
import { getTask, createCrewEvent, type CrewEventType } from '../api/tasks';
import { TaskAttachments } from '../components/TaskAttachments';
import { useCurrentUser } from '../context/CurrentUserContext';
import { formatShortName } from '../formatName';
import { formatShortDateTimeWithAgo } from '../formatTime';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { openMapsNavigation } from '../openMapsNavigation';
import type { TaskContact, TaskDetail, TaskStatus } from '../types/task';

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

function isTerminalStatus(status: TaskStatus): boolean {
	return status === 'Completed' || status === 'Failed' || status === 'Cancelled';
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
}: {
	task: TaskDetail;
	userId: string | null;
	onCrewEvent: (eventType: CrewEventType) => Promise<void>;
}) {
	const cameraInputRef = useRef<HTMLInputElement>(null);
	const [eventBusy, setEventBusy] = useState(false);
	const [eventError, setEventError] = useState<string | null>(null);
	const address = task.destinationAddress.trim();
	const destinationName = task.destinationAddressName.trim();
	const canNavigate = Boolean(address);

	const me = userId
		? task.crewMembers.find((m) => m.id === userId)
		: undefined;
	const canStart =
		Boolean(me) && !me?.startedAt && !isTerminalStatus(task.status);
	const canEnd =
		Boolean(me?.startedAt) &&
		!me?.endedAt &&
		task.status !== 'Failed' &&
		task.status !== 'Cancelled';

	const openCamera = () => {
		cameraInputRef.current?.click();
	};

	const logCrewEvent = async (eventType: CrewEventType) => {
		if (eventBusy) return;
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
			<input
				ref={cameraInputRef}
				type='file'
				accept='image/*'
				capture='environment'
				hidden
				aria-hidden
				tabIndex={-1}
			/>
			<div className='task-view-actions' role='group' aria-label='Task actions'>
				<ActionButton
					label='Navigate'
					icon={Navigation}
					disabled={!canNavigate || eventBusy}
					onClick={() => openMapsNavigation(address)}
				/>
				<ActionButton
					label='Start task'
					icon={Play}
					disabled={!canStart || eventBusy}
					onClick={() => void logCrewEvent('started')}
				/>
				<ActionButton
					label='End task'
					icon={CheckCircle}
					disabled={!canEnd || eventBusy}
					onClick={() => void logCrewEvent('ended')}
				/>
				<ActionButton
					label='Photo'
					icon={Camera}
					disabled={eventBusy}
					onClick={openCamera}
				/>
			</div>

			{eventError ? (
				<Alert color='red' title='Check-in failed'>
					{eventError}
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
					<span className='task-status' data-status={task.status}>
						{task.status}
					</span>
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
			navigate('/tasks');
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
						crewMembers: prev.crewMembers.map((m) =>
							m.id === user.id
								? {
										...m,
										startedAt:
											eventType === 'started'
												? event.recordedAt
												: m.startedAt,
										endedAt:
											eventType === 'ended' ? event.recordedAt : m.endedAt,
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
				/>
			) : null}
		</Box>
	);
}
