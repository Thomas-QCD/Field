import type { TaskStatus } from '../types/task';

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
	return (
		<span className='task-status' data-status={status}>
			{status}
		</span>
	);
}
