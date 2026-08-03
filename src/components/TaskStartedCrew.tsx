import { formatShortName } from '../formatName';
import type { TaskCrewMember, TaskStatus } from '../types/task';

function isActivelyStartedStatus(status: TaskStatus): boolean {
	return status === 'In Progress' || status === 'Loaded';
}

/** Crew who have started and not yet ended, oldest start first. */
function getActiveStarters(crewMembers: TaskCrewMember[]): TaskCrewMember[] {
	return crewMembers
		.filter((m) => m.startedAt && !m.endedAt)
		.sort(
			(a, b) =>
				new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime(),
		);
}

/** Compact elapsed, e.g. "5m" / "2hr" / "3d". */
function formatStartedElapsed(value: string | null): string | null {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;

	const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
	if (seconds < 60 * 60) return `${Math.max(1, Math.round(seconds / 60))}m`;
	if (seconds < 24 * 60 * 60) return `${Math.round(seconds / 3600)}hr`;
	return `${Math.round(seconds / 86400)}d`;
}

/** Live callout of crew currently working the task. */
export function TaskStartedCrew({
	status,
	crewMembers,
}: {
	status: TaskStatus;
	crewMembers: TaskCrewMember[];
}) {
	if (!isActivelyStartedStatus(status)) return null;

	const starters = getActiveStarters(crewMembers);
	if (starters.length === 0) return null;

	return (
		<section className='task-started-live' aria-label='Currently started'>
			<div className='task-started-live-header'>
				<span className='task-started-live-dot' aria-hidden />
				<h3 className='task-started-live-label'>In Progress</h3>
			</div>
			<ul className='task-started-live-list'>
				{starters.map((m) => {
					const elapsed = formatStartedElapsed(m.startedAt);
					return (
						<li key={m.id} className='task-started-live-row'>
							<span className='task-started-live-name'>
								{formatShortName(m.displayName)}
							</span>
							{elapsed ? (
								<span className='task-started-live-elapsed'>({elapsed})</span>
							) : null}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
