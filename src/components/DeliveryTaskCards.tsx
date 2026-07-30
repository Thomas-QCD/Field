import { useLayoutEffect, useRef, useState } from 'react';
import type { Task } from '../types/task';
import { formatShortDateTimeWithAgo } from '../formatTime';
import { TaskStatusBadge } from './TaskStatusBadge';

function formatFullAddress(task: Task): string {
	const street = task.destinationStreet.trim();
	const building = task.destinationBuilding.trim();
	if (street && building) return `${street}, ${building}`;
	return street || building || '';
}

function DeliveryTaskCard({
	task,
	onSelect,
}: {
	task: Task;
	onSelect: (taskId: number) => void;
}) {
	const descriptionRef = useRef<HTMLDivElement>(null);
	const [clipped, setClipped] = useState(false);

	const addressName = task.destinationAddressName.trim();
	const fullAddress = formatFullAddress(task);

	useLayoutEffect(() => {
		const desc = descriptionRef.current;
		if (!desc) {
			setClipped(false);
			return;
		}

		const update = () => {
			setClipped(desc.scrollHeight > desc.clientHeight + 1);
		};

		update();
		const ro = new ResizeObserver(update);
		ro.observe(desc);
		return () => ro.disconnect();
	}, [task.description]);

	return (
		<div className='task-card-frame'>
			<button
				type='button'
				className={
					clipped
						? 'delivery-card delivery-card--clipped'
						: 'delivery-card'
				}
				onClick={() => onSelect(task.id)}
			>
				<header className='delivery-card-header'>
					<span className='delivery-card-job'>
						{task.externalKey ? `#${task.externalKey}` : 'Delivery'}
					</span>
					<TaskStatusBadge status={task.status} />
				</header>

				<div className='delivery-card-address'>
					{addressName ? (
						<span className='delivery-card-address-name'>{addressName}</span>
					) : null}
					<span className='delivery-card-address-line'>
						{fullAddress || '—'}
					</span>
				</div>

				<div className='delivery-card-times'>
					<div className='delivery-card-time'>
						<span className='delivery-card-time-label'>Start</span>
						<span className='delivery-card-time-value'>
							{formatShortDateTimeWithAgo(task.windowStartAt)}
						</span>
					</div>
					<div className='delivery-card-time'>
						<span className='delivery-card-time-label'>End</span>
						<span className='delivery-card-time-value'>
							{formatShortDateTimeWithAgo(task.windowEndAt)}
						</span>
					</div>
				</div>

				{task.description ? (
					<div
						ref={descriptionRef}
						className='delivery-card-description-wrap'
					>
						<p className='delivery-card-description'>{task.description}</p>
					</div>
				) : null}
			</button>
		</div>
	);
}

export function DeliveryTaskCards({
	tasks,
	onSelect,
	emptyMessage = 'No delivery tasks match these filters.',
}: {
	tasks: Task[];
	onSelect: (taskId: number) => void;
	emptyMessage?: string;
}) {
	if (tasks.length === 0) {
		return <p className='task-cards-empty'>{emptyMessage}</p>;
	}

	return (
		<div className='task-cards'>
			{tasks.map((task) => (
				<DeliveryTaskCard key={task.id} task={task} onSelect={onSelect} />
			))}
		</div>
	);
}
