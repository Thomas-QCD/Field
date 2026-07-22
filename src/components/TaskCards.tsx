import type { Task } from '../types/task';
import { formatShortName, formatShortNameList } from '../formatName';
import { formatShortDateTimeWithAgo } from '../formatTime';

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

export function TaskCards({
	tasks,
	onSelect,
}: {
	tasks: Task[];
	onSelect: (taskId: number) => void;
}) {
	if (tasks.length === 0) {
		return <p className='task-cards-empty'>No tasks for today.</p>;
	}

	return (
		<div className='task-cards'>
			{tasks.map((task) => (
				<button
					key={task.id}
					type='button'
					className='task-card'
					onClick={() => onSelect(task.id)}
				>
					<header className='task-card-header'>
						<span className='task-card-type'>{task.taskType}</span>
						<span className='task-status' data-status={task.status}>
							{task.status}
						</span>
					</header>

					<div className='task-card-meta'>
						<CardRow label='Location' value={task.destinationAddress} />
						<CardRow
							label='Window'
							value={formatWindow(task.windowStartAt, task.windowEndAt)}
						/>
						<CardRow
							label='Job'
							value={task.externalKey ? `#${task.externalKey}` : ''}
						/>
						<CardRow
							label='Created by'
							value={
								task.createdByName
									? formatShortName(task.createdByName)
									: ''
							}
						/>
						<CardRow
							label='Crew'
							value={
								task.crewName
									? formatShortNameList(task.crewName)
									: ''
							}
						/>
					</div>

					{task.description ? (
						<p className='task-card-description'>{task.description}</p>
					) : null}
				</button>
			))}
		</div>
	);
}
