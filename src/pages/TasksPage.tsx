import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Group, Loader, Title, Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus } from 'lucide-react';
import type {
	ColDef,
	RowClickedEvent,
	ValueFormatterParams,
} from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { createTask, deleteTask, listTasks, updateTask } from '../api/tasks';
import { useCurrentUser } from '../context/CurrentUserContext';
import type { Task, TaskDetail } from '../types/task';
import {
	NewTaskModal,
	type NewTaskFormValues,
} from '../components/NewTaskModal';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { TaskCards } from '../components/TaskCards';
import { formatTimeAgo } from '../formatTime';

function toDateTimeLocal(iso: string | null): string {
	if (!iso) {
		const d = new Date();
		d.setSeconds(0, 0);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return toDateTimeLocal(null);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameLocalDay(iso: string | null, day: Date): boolean {
	if (!iso) return false;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return false;
	return (
		d.getFullYear() === day.getFullYear() &&
		d.getMonth() === day.getMonth() &&
		d.getDate() === day.getDate()
	);
}

function startTimeMs(iso: string | null): number {
	if (!iso) return Number.POSITIVE_INFINITY;
	const ms = new Date(iso).getTime();
	return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function taskDetailToFormValues(task: TaskDetail): NewTaskFormValues {
	const contactIds = task.contacts.map((c) => c.id);
	const poc = task.contacts.find((c) => c.isPoc);
	return {
		contactIds,
		pocContactId: poc?.id ?? contactIds[0] ?? null,
		taskType: task.taskType,
		externalKey: task.externalKey,
		taskDesc: task.description,
		destinationAddressId: task.destinationAddressId,
		destinationAddressName: task.destinationAddressName,
		destinationAddress: task.destinationAddress,
		destinationBuilding: task.destinationBuilding,
		destinationNotes: task.destinationNotes,
		afterDateTime: toDateTimeLocal(task.windowStartAt),
		beforeDateTime: toDateTimeLocal(task.windowEndAt),
		crewMemberIds: task.crewMembers.map((m) => m.id),
		guys: task.crewSize ?? '',
		hours: task.estimatedHours ?? '',
		canStartEarly: task.canStartEarly ? 'true' : 'false',
		isTimeSpecific: task.isTimeSpecific ? 'true' : 'false',
	};
}

const columnDefs: ColDef<Task>[] = [
	{
		field: 'externalKey',
		headerName: 'Job',
		valueFormatter: (p: ValueFormatterParams<Task, string>) => {
			const value = p.value ?? '';
			// Look for the first sequence of 5 or 6 consecutive digits
			const m = value.match(/\d{5,6}/);
			if (m) return m[0];
			return value;
		},
		width: 60,
		minWidth: 60,
		maxWidth: 60,
		suppressSizeToFit: true,
	},
	{
		field: 'taskType',
		headerName: 'Type',
		minWidth: 72,
		flex: 0.5,
		valueFormatter: (p: ValueFormatterParams<Task, string>) => {
			const value = p.value ?? '';
			if (value === 'Site Survey') return 'SS';
			return value;
		},
	},
	{
		field: 'destinationAddress',
		headerName: 'Destination',
		minWidth: 120,
		flex: 1.2,
	},
	{
		field: 'windowStartAt',
		headerName: 'Start',
		valueFormatter: (p: ValueFormatterParams<Task, string | null>) =>
			formatTimeAgo(p.value ?? null) ?? '',
		minWidth: 120,
		flex: 1.2,
	},
];

/** Survives TasksPage remount when navigating to/from task view. */
let showTodayOnlyMemory = false;

export function TasksPage({ mode = 'all' }: { mode?: 'all' | 'mine' }) {
	const { user } = useCurrentUser();
	const navigate = useNavigate();
	const isMobile = useMediaQuery('(max-width: 47.9975em)');
	const [newTaskOpen, setNewTaskOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
	const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [hideDelivery, setHideDelivery] = useState(false);
	const [showTodayOnly, setShowTodayOnly] = useState(showTodayOnlyMemory);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const defaultColDef = useMemo<ColDef<Task>>(
		() => ({
			sortable: true,
			filter: !isMobile,
			resizable: true,
		}),
		[isMobile],
	);

	const visibleTasks = useMemo(() => {
		let next = tasks;
		if (mode === 'all' && hideDelivery) {
			next = next.filter((task) => task.taskType !== 'Delivery');
		}
		if (mode === 'mine' && showTodayOnly) {
			const today = new Date();
			next = next.filter((task) => isSameLocalDay(task.windowStartAt, today));
		}
		if (mode === 'mine') {
			next = [...next].sort(
				(a, b) => startTimeMs(a.windowStartAt) - startTimeMs(b.windowStartAt),
			);
		}
		return next;
	}, [tasks, mode, hideDelivery, showTodayOnly]);

	const useCardView = mode === 'mine' && showTodayOnly && Boolean(isMobile);

	const crewMemberId = mode === 'mine' ? (user?.id ?? null) : null;

	const refreshTasks = useCallback(
		async (signal?: AbortSignal) => {
			if (mode === 'mine' && !crewMemberId) {
				setTasks([]);
				setLoading(false);
				setError(null);
				return;
			}
			setLoading(true);
			setError(null);
			try {
				const next = await listTasks(signal, {
					crewMemberId: crewMemberId ?? undefined,
				});
				if (!signal?.aborted) setTasks(next);
			} catch (err: unknown) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load tasks');
			} finally {
				if (!signal?.aborted) setLoading(false);
			}
		},
		[mode, crewMemberId],
	);

	useEffect(() => {
		const controller = new AbortController();
		void refreshTasks(controller.signal);
		return () => controller.abort();
	}, [refreshTasks]);

	const handleSaveTask = async (values: NewTaskFormValues) => {
		if (editingTask) {
			await updateTask(editingTask.id, values);
		} else {
			if (!user) {
				throw new Error('Select a user in the sidebar before saving a task');
			}
			await createTask({
				...values,
				createdByUserId: user.id,
			});
		}
		await refreshTasks();
	};

	const openTask = (id: number) => {
		if (isMobile) {
			navigate(`/task/${id}`);
			return;
		}
		setDetailTaskId(id);
	};

	const handleRowClicked = (event: RowClickedEvent<Task>) => {
		if (event.data?.id != null) {
			openTask(event.data.id);
		}
	};

	const handleEditTask = (task: TaskDetail) => {
		setDetailTaskId(null);
		setEditingTask(task);
	};

	const handleDeleteTask = async (task: TaskDetail) => {
		await deleteTask(task.id);
		setDetailTaskId(null);
		await refreshTasks();
	};

	const handleCloseEditor = () => {
		setNewTaskOpen(false);
		setEditingTask(null);
	};

	const editorInitialValues = useMemo<NewTaskFormValues | null>(
		() => (editingTask ? taskDetailToFormValues(editingTask) : null),
		[editingTask],
	);

	const pageTitle =
		mode === 'mine' ? (showTodayOnly ? "Today's Tasks" : 'My Tasks') : 'Tasks';

	return (
		<Box className='tasks-page'>
			<Group justify='space-between' mb='md' wrap='nowrap'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					{pageTitle}
				</Title>
				{mode === 'mine' ? (
					<Button
						variant={showTodayOnly ? 'light' : 'default'}
						color='brand'
						onClick={() =>
							setShowTodayOnly((v) => {
								const next = !v;
								showTodayOnlyMemory = next;
								return next;
							})
						}
					>
						{showTodayOnly ? 'Show All' : 'Show Today Only'}
					</Button>
				) : (
					<Button
						variant={hideDelivery ? 'light' : 'default'}
						color='brand'
						onClick={() => setHideDelivery((v) => !v)}
					>
						{hideDelivery ? 'Show Delivery' : 'Hide Delivery'}
					</Button>
				)}
				{mode === 'all' ? (
					<Button
						leftSection={<Plus size={18} />}
						onClick={() => {
							setEditingTask(null);
							setNewTaskOpen(true);
						}}
						color='brand'
					>
						New Task
					</Button>
				) : null}
			</Group>

			{mode === 'mine' && !user ? (
				<Alert color='yellow' title='Select a user' mb='md'>
					Choose a crew member in the sidebar to see their assigned tasks.
				</Alert>
			) : null}

			{error ? (
				<Alert color='red' title='Could not load tasks' mb='md'>
					{error}
				</Alert>
			) : null}

			{loading && tasks.length === 0 ? (
				<Group justify='center' py='xl'>
					<Loader size='sm' />
				</Group>
			) : useCardView ? (
				<Box className='tasks-cards-wrap'>
					<TaskCards tasks={visibleTasks} onSelect={openTask} />
				</Box>
			) : (
				<Box className='tasks-grid-wrap ag-theme-quartz'>
					<AgGridProvider modules={[AllCommunityModule]}>
						<AgGridReact<Task>
							rowData={visibleTasks}
							columnDefs={columnDefs}
							defaultColDef={defaultColDef}
							getRowId={(p) => String(p.data.id)}
							rowHeight={isMobile ? 40 : undefined}
							animateRows
							suppressCellFocus
							suppressHorizontalScroll
							rowStyle={{ cursor: 'pointer' }}
							onRowClicked={handleRowClicked}
							onGridSizeChanged={(e) => e.api.sizeColumnsToFit()}
							onFirstDataRendered={(e) => e.api.sizeColumnsToFit()}
						/>
					</AgGridProvider>
				</Box>
			)}

			<NewTaskModal
				opened={newTaskOpen || editingTask != null}
				onClose={handleCloseEditor}
				initialValues={editorInitialValues}
				onSave={handleSaveTask}
			/>

			<TaskDetailModal
				taskId={detailTaskId}
				opened={!isMobile && detailTaskId != null}
				onClose={() => setDetailTaskId(null)}
				onEdit={handleEditTask}
				onDelete={handleDeleteTask}
			/>
		</Box>
	);
}
