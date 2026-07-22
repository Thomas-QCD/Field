import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import {
	Camera,
	ChevronLeft,
	MessageSquare,
	Navigation,
	Phone,
} from 'lucide-react';
import { getTask } from '../api/tasks';
import { TaskAttachments } from '../components/TaskAttachments';
import { formatShortName } from '../formatName';
import { formatShortDateTimeWithAgo } from '../formatTime';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { openMapsNavigation } from '../openMapsNavigation';
import type { TaskDetail } from '../types/task';

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

function TaskViewBody({ task }: { task: TaskDetail }) {
	const cameraInputRef = useRef<HTMLInputElement>(null);
	const address = task.destinationAddress.trim();
	const destinationName = task.destinationAddressName.trim();
	const canNavigate = Boolean(address);

	const openCamera = () => {
		cameraInputRef.current?.click();
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
					disabled={!canNavigate}
					onClick={() => openMapsNavigation(address)}
				/>
				<ActionButton label='Call' icon={Phone} />
				<ActionButton label='Text' icon={MessageSquare} />
				<ActionButton label='Photo' icon={Camera} onClick={openCamera} />
			</div>

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
					label='Can install early'
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
				<TaskViewBody task={task} />
			) : null}
		</Box>
	);
}
