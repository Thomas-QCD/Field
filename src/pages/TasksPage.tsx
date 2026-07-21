import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Loader, Title, Box } from '@mantine/core';
import { Plus } from 'lucide-react';
import type {
	ColDef,
	ICellRendererParams,
	RowClickedEvent,
	ValueFormatterParams,
} from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { createTask, deleteTask, listTasks, updateTask } from '../api/tasks';
import { useCurrentUser } from '../context/CurrentUserContext';
import type { Task, TaskDetail, TaskStatus } from '../types/task';
import {
	NewTaskModal,
	type NewTaskFormValues,
} from '../components/NewTaskModal';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { formatShortNameList } from '../formatName';

function StatusCell({ value }: ICellRendererParams<Task, TaskStatus>) {
	if (!value) return null;
	return (
		<span className='task-status' data-status={value}>
			{value}
		</span>
	);
}

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

function taskDetailToFormValues(task: TaskDetail): NewTaskFormValues {
	return {
		contactIds: task.contacts.map((c) => c.id),
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
		valueFormatter: (p: ValueFormatterParams<Task, string>) =>
			p.value ? `#${p.value}` : '',
		minWidth: 56,
		flex: 0.6,
	},
	{
		field: 'taskType',
		headerName: 'Type',
		minWidth: 72,
		flex: 0.6,
	},
	{
		field: 'status',
		headerName: 'Status',
		cellRenderer: StatusCell,
		minWidth: 88,
		flex: 0.6,
	},
	{
		field: 'crewName',
		headerName: 'Crew',
		valueFormatter: (p: ValueFormatterParams<Task, string | null>) =>
			p.value ? formatShortNameList(p.value) : 'Unassigned',
		minWidth: 88,
		flex: 1,
	},
	{
		field: 'destinationAddress',
		headerName: 'Destination',
		minWidth: 120,
		flex: 1.2,
	},
	{
		field: 'contactNames',
		headerName: 'Contacts',
		valueFormatter: (p: ValueFormatterParams<Task, string>) =>
			p.value ? formatShortNameList(p.value) : '',
		minWidth: 88,
		flex: 1,
	},
];

export function TasksPage({ mode = 'all' }: { mode?: 'all' | 'mine' }) {
	const { user } = useCurrentUser();
	const [newTaskOpen, setNewTaskOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
	const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [hideDelivery, setHideDelivery] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const defaultColDef = useMemo<ColDef<Task>>(
		() => ({
			sortable: true,
			filter: true,
			resizable: true,
		}),
		[],
	);

	const visibleTasks = useMemo(
		() =>
			hideDelivery
				? tasks.filter((task) => task.taskType !== 'Delivery')
				: tasks,
		[tasks, hideDelivery],
	);

	const crewMemberId = mode === 'mine' ? user?.id ?? null : null;

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

	const handleRowClicked = (event: RowClickedEvent<Task>) => {
		if (event.data?.id != null) {
			setDetailTaskId(event.data.id);
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

	const pageTitle = mode === 'mine' ? 'My Tasks' : 'Tasks';

	return (
		<Box className='tasks-page'>
			<Group justify='space-between' mb='md' wrap='nowrap'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					{pageTitle}
				</Title>
				<Button
					variant={hideDelivery ? 'light' : 'default'}
					color='brand'
					onClick={() => setHideDelivery((v) => !v)}
				>
					{hideDelivery ? 'Show Delivery' : 'Hide Delivery'}
				</Button>
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

			<Box className='tasks-grid-wrap ag-theme-quartz'>
				{loading && tasks.length === 0 ? (
					<Group justify='center' py='xl'>
						<Loader size='sm' />
					</Group>
				) : (
					<AgGridProvider modules={[AllCommunityModule]}>
						<AgGridReact<Task>
							rowData={visibleTasks}
							columnDefs={columnDefs}
							defaultColDef={defaultColDef}
							getRowId={(p) => String(p.data.id)}
							animateRows
							suppressCellFocus
							suppressHorizontalScroll
							rowStyle={{ cursor: 'pointer' }}
							onRowClicked={handleRowClicked}
							onGridSizeChanged={(e) => e.api.sizeColumnsToFit()}
							onFirstDataRendered={(e) => e.api.sizeColumnsToFit()}
						/>
					</AgGridProvider>
				)}
			</Box>

			<NewTaskModal
				opened={newTaskOpen || editingTask != null}
				onClose={handleCloseEditor}
				initialValues={editorInitialValues}
				onSave={handleSaveTask}
			/>

			<TaskDetailModal
				taskId={detailTaskId}
				opened={detailTaskId != null}
				onClose={() => setDetailTaskId(null)}
				onEdit={handleEditTask}
				onDelete={handleDeleteTask}
			/>
		</Box>
	);
}
