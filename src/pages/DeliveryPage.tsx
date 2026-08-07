import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	Alert,
	Box,
	Button,
	Group,
	Loader,
	Text,
	TextInput,
	UnstyledButton,
} from '@mantine/core';
import { ChevronLeft, Filter, Search } from 'lucide-react';
import { listTasks } from '../api/tasks';
import { DeliveryTaskCards } from '../components/DeliveryTaskCards';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { useFieldPullToRefresh } from '../hooks/useFieldPullToRefresh';
import type { Task, TaskStatus } from '../types/task';

const STATUS_FILTERS = [
	{ value: 'all', label: 'All', statuses: null },
	{ value: 'assigned', label: 'Assigned', statuses: ['Assigned'] as const },
	{ value: 'loaded', label: 'Loaded', statuses: ['Loaded'] as const },
] as const;

type StatusFilterValue = (typeof STATUS_FILTERS)[number]['value'];

const DUE_DATE_FILTERS = [
	{ value: 'all', label: 'All' },
	{ value: 'overdue', label: 'Overdue' },
	{ value: 'today', label: 'Due today' },
	{ value: 'tomorrow', label: 'Tomorrow' },
] as const;

type DueDateFilterValue = (typeof DUE_DATE_FILTERS)[number]['value'];

function matchesStatusFilter(
	status: TaskStatus,
	filter: StatusFilterValue,
): boolean {
	const entry = STATUS_FILTERS.find((f) => f.value === filter);
	if (!entry || entry.statuses == null) return true;
	return (entry.statuses as readonly TaskStatus[]).includes(status);
}

function startOfLocalDay(day = new Date()): Date {
	return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}

/** Prefer window end as the due date; fall back to start. */
function taskDueDate(task: Task): Date | null {
	const iso = task.windowEndAt ?? task.windowStartAt;
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

function isSameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function matchesDueDateFilter(
	task: Task,
	filter: DueDateFilterValue,
): boolean {
	if (filter === 'all') return true;
	const due = taskDueDate(task);
	if (!due) return false;

	const today = startOfLocalDay();
	if (filter === 'overdue') return due < today;
	if (filter === 'today') return isSameLocalDay(due, today);

	const tomorrow = startOfLocalDay();
	tomorrow.setDate(tomorrow.getDate() + 1);
	if (filter === 'tomorrow') return isSameLocalDay(due, tomorrow);

	return true;
}

export function DeliveryPage() {
	const navigate = useNavigate();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
	const [dueDateFilter, setDueDateFilter] =
		useState<DueDateFilterValue>('all');
	const [filterViewOpen, setFilterViewOpen] = useState(false);
	const [jobNumber, setJobNumber] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useAndroidBackHandler(() => setFilterViewOpen(false), filterViewOpen);

	const refreshTasks = useCallback(async (signal?: AbortSignal) => {
		setLoading(true);
		setError(null);
		try {
			const next = await listTasks(signal);
			if (!signal?.aborted) {
				// Cancelled deliveries only on desktop Delivery Cancelled tab.
				setTasks(
					next.filter(
						(task) =>
							task.taskType === 'Delivery' && task.status !== 'Cancelled',
					),
				);
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

	const {
		scrollRef: ptrScrollRef,
		pullPosition,
		isRefreshing: ptrRefreshing,
	} = useFieldPullToRefresh({
		enabled: true,
		onRefresh: refreshTasks,
	});

	const statusCounts = useMemo(() => {
		const counts = { all: 0, assigned: 0, loaded: 0 } as Record<
			StatusFilterValue,
			number
		>;
		for (const task of tasks) {
			if (!matchesDueDateFilter(task, dueDateFilter)) continue;
			counts.all += 1;
			if (task.status === 'Assigned') counts.assigned += 1;
			if (task.status === 'Loaded') counts.loaded += 1;
		}
		return counts;
	}, [tasks, dueDateFilter]);

	const visibleTasks = useMemo(() => {
		const jobQuery = jobNumber.trim();
		return tasks.filter((task) => {
			if (!matchesStatusFilter(task.status, statusFilter)) return false;
			if (!matchesDueDateFilter(task, dueDateFilter)) return false;
			if (jobQuery && !task.externalKey.includes(jobQuery)) return false;
			return true;
		});
	}, [tasks, statusFilter, dueDateFilter, jobNumber]);

	if (filterViewOpen) {
		return (
			<Box className='tasks-page delivery-page delivery-filter-view'>
				<header className='delivery-filter-header'>
					<UnstyledButton
						onClick={() => setFilterViewOpen(false)}
						aria-label='Back'
						className='delivery-filter-back'
					>
						<ChevronLeft size={28} strokeWidth={2} aria-hidden />
					</UnstyledButton>
					<Text fw={700} fz='lg' className='delivery-filter-title'>
						Task filters
					</Text>
				</header>

				<section
					className='delivery-filter-section'
					aria-labelledby='delivery-filter-due-date-label'
				>
					<h2
						id='delivery-filter-due-date-label'
						className='delivery-filter-section-label'
					>
						Due date
					</h2>
					<div
						className='delivery-filter-options'
						role='group'
						aria-label='Filter tasks by due date'
					>
						{DUE_DATE_FILTERS.map((option) => {
							const selected = option.value === dueDateFilter;
							return (
								<button
									key={option.value}
									type='button'
									className='delivery-filter-option'
									data-selected={selected || undefined}
									aria-pressed={selected}
									onClick={() => setDueDateFilter(option.value)}
								>
									{option.label}
								</button>
							);
						})}
					</div>
				</section>
			</Box>
		);
	}

	return (
		<Box className='tasks-page delivery-page'>
			<PullToRefreshIndicator
				pullPosition={pullPosition}
				isRefreshing={ptrRefreshing}
			/>
			<Group justify='space-between' mb='md' wrap='nowrap' gap='sm'>
				<Button
					variant='default'
					radius='xl'
					leftSection={<Filter size={16} />}
					className='delivery-count-btn'
					aria-label={`${visibleTasks.length} tasks, open filters`}
					onClick={() => setFilterViewOpen(true)}
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
				<Box ref={ptrScrollRef} className='tasks-cards-wrap'>
					<DeliveryTaskCards
						tasks={visibleTasks}
						onSelect={(id) => navigate(`/task/${id}`)}
					/>
				</Box>
			)}
		</Box>
	);
}
