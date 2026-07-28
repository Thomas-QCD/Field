import { useLayoutEffect, useRef, useState } from 'react';
import type { Task } from '../types/task';
import { formatShortName, formatShortNameList } from '../formatName';
import { formatShortDateTimeWithAgo } from '../formatTime';
import { TaskStatusBadge } from './TaskStatusBadge';

function formatWindow(start: string | null, end: string | null): string {
	return `${formatShortDateTimeWithAgo(start)} – ${formatShortDateTimeWithAgo(end)}`;
}

function CardRow({ label, value }: { label: string; value: string }) {
	return (
		<div className='task-card-row'>
			<span className='task-card-row-label'>{label}</span>
			<span className='task-card-row-value'>{value || '—'}</span>
		</div>
	);
}

function TaskCard({
	task,
	onSelect,
}: {
	task: Task;
	onSelect: (taskId: number) => void;
}) {
	const cardRef = useRef<HTMLButtonElement>(null);
	const descriptionRef = useRef<HTMLDivElement>(null);
	const [clipped, setClipped] = useState(false);

	useLayoutEffect(() => {
		const card = cardRef.current;
		if (!card) return;

		const update = () => {
			const desc = descriptionRef.current;
			// Description flex-shrinks inside the 1:1 cap, so check that node —
			// the card itself often has scrollHeight === clientHeight.
			setClipped(
				Boolean(desc && desc.scrollHeight > desc.clientHeight + 1),
			);
		};

		update();
		const ro = new ResizeObserver(update);
		ro.observe(card);
		if (descriptionRef.current) ro.observe(descriptionRef.current);
		return () => ro.disconnect();
	}, [task.description]);

	return (
		<div className='task-card-frame'>
			<button
				ref={cardRef}
				type='button'
				className={clipped ? 'task-card task-card--clipped' : 'task-card'}
				onClick={() => onSelect(task.id)}
			>
				<header className='task-card-header'>
					<span className='task-card-type'>
						{task.externalKey
							? `${task.taskType} - #${task.externalKey}`
							: task.taskType}
					</span>
					<TaskStatusBadge status={task.status} />
				</header>

				<div className='task-card-meta'>
					<CardRow label='Location' value={task.destinationAddress} />
					<CardRow
						label='Window'
						value={formatWindow(task.windowStartAt, task.windowEndAt)}
					/>
					<CardRow
						label='Created by'
						value={
							task.createdByName ? formatShortName(task.createdByName) : ''
						}
					/>
					<CardRow
						label='Crew'
						value={
							task.crewName ? formatShortNameList(task.crewName) : ''
						}
					/>
				</div>

				{task.description ? (
					<div
						ref={descriptionRef}
						className='task-card-description-wrap'
					>
						<p className='task-card-description'>{task.description}</p>
					</div>
				) : null}
			</button>
		</div>
	);
}

export function TaskCards({
	tasks,
	onSelect,
}: {
	tasks: Task[];
	onSelect: (taskId: number) => void;
}) {
	if (tasks.length === 0) {
		return <p className='task-cards-empty'>No tasks for this day.</p>;
	}

	return (
		<div className='task-cards'>
			{tasks.map((task) => (
				<TaskCard key={task.id} task={task} onSelect={onSelect} />
			))}
		</div>
	);
}
