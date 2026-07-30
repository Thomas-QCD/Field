import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Group, Loader, TextInput } from '@mantine/core';
import { Filter, Search } from 'lucide-react';
import { listTasks } from '../api/tasks';
import { DeliveryTaskCards } from '../components/DeliveryTaskCards';
import type { Task, TaskStatus } from '../types/task';

const STATUS_FILTERS = [
	{ value: 'all', label: 'All', statuses: null },
	{ value: 'assigned', label: 'Assigned', statuses: ['Assigned'] as const },
	{ value: 'loaded', label: 'Loaded', statuses: ['Loaded'] as const },
] as const;

type StatusFilterValue = (typeof STATUS_FILTERS)[number]['value'];

function matchesStatusFilter(
	status: TaskStatus,
	filter: StatusFilterValue,
): boolean {
	const entry = STATUS_FILTERS.find((f) => f.value === filter);
	if (!entry || entry.statuses == null) return true;
	return (entry.statuses as readonly TaskStatus[]).includes(status);
}

export function DeliveryPage() {
	const navigate = useNavigate();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
	const [jobNumber, setJobNumber] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refreshTasks = useCallback(async (signal?: AbortSignal) => {
		setLoading(true);
		setError(null);
		try {
			const next = await listTasks(signal);
			if (!signal?.aborted) {
				setTasks(next.filter((task) => task.taskType === 'Delivery'));
			}
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Failed to load tasks');
		} finally {
			if (!signal?.aborted) setLoading(false);
		}
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		void refreshTasks(controller.signal);
		return () => controller.abort();
	}, [refreshTasks]);

	const statusCounts = useMemo(() => {
		const counts = { all: 0, assigned: 0, loaded: 0 } as Record<
			StatusFilterValue,
			number
		>;
		for (const task of tasks) {
			counts.all += 1;
			if (task.status === 'Assigned') counts.assigned += 1;
			if (task.status === 'Loaded') counts.loaded += 1;
		}
		return counts;
	}, [tasks]);

	const visibleTasks = useMemo(() => {
		const jobQuery = jobNumber.trim();
		return tasks.filter((task) => {
			if (!matchesStatusFilter(task.status, statusFilter)) return false;
			if (jobQuery && !task.externalKey.includes(jobQuery)) return false;
			return true;
		});
	}, [tasks, statusFilter, jobNumber]);

	return (
		<Box className='tasks-page delivery-page'>
			<Group justify='space-between' mb='md' wrap='nowrap' gap='sm'>
				<Button
					variant='default'
					radius='xl'
					leftSection={<Filter size={16} />}
					className='delivery-count-btn'
					aria-label={`${visibleTasks.length} tasks`}
				>
					{visibleTasks.length} Tasks
				</Button>
			</Group>

			<div
				className='delivery-status-chips'
				role='tablist'
				aria-label='Filter delivery tasks by status'
			>
				{STATUS_FILTERS.map((filter) => {
					const selected = filter.value === statusFilter;
					const count = statusCounts[filter.value];
					return (
						<button
							key={filter.value}
							type='button'
							role='tab'
							aria-selected={selected}
							className='delivery-status-chip'
							data-selected={selected || undefined}
							onClick={() => setStatusFilter(filter.value)}
						>
							<span className='delivery-status-chip-label'>{filter.label}</span>
							<span className='delivery-status-chip-count'>{count}</span>
						</button>
					);
				})}
			</div>

			<TextInput
				type='number'
				inputMode='numeric'
				placeholder='Search task'
				leftSection={<Search size={16} />}
				value={jobNumber}
				onChange={(e) => setJobNumber(e.currentTarget.value)}
				mb='md'
				aria-label='Filter by job number'
				className='delivery-job-input'
			/>

			{error ? (
				<Alert color='red' title='Could not load tasks' mb='md'>
					{error}
				</Alert>
			) : null}

			{loading && tasks.length === 0 ? (
				<Group justify='center' py='xl'>
					<Loader size='sm' />
				</Group>
			) : (
				<Box className='tasks-cards-wrap'>
					<DeliveryTaskCards
						tasks={visibleTasks}
						onSelect={(id) => navigate(`/task/${id}`)}
					/>
				</Box>
			)}
		</Box>
	);
}
