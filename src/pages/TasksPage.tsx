import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	Alert,
	Button,
	Checkbox,
	Group,
	Loader,
	Menu,
	Title,
	Box,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Columns3, Plus } from 'lucide-react';
import type { GridApi, RowClickedEvent } from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { createTask, deleteTask, listTasks, updateTask } from '../api/tasks';
import { uploadAttachment } from '../api/attachments';
import { useCurrentUser } from '../context/CurrentUserContext';
import { formatShortName } from '../formatName';
import type { Task, TaskDetail } from '../types/task';
import {
	NewTaskModal,
	type NewTaskFormValues,
} from '../components/NewTaskModal';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { TaskCards } from '../components/TaskCards';
import {
	AG_GRID_MOBILE_MQ,
	DEFAULT_VISIBLE_TASK_COLUMNS,
	getDefaultColDef,
	getTaskColumnDefs,
	readVisibleTaskColumns,
	TASK_COLUMN_OPTIONS,
	type TaskColumnField,
	writeVisibleTaskColumns,
} from '../agGridDefaults';

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
	// POC first so the MultiSelect pill order matches “first = POC”.
	const contactIds = [...task.contacts]
		.sort((a, b) => Number(b.isPoc) - Number(a.isPoc))
		.map((c) => c.id);
	return {
		contactIds,
		pocContactId: contactIds[0] ?? null,
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

const MONTH_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
] as const;

/** Local calendar day key YYYY-MM-DD for stable compare/select. */
function localDayKey(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayKeyFromIso(iso: string | null): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return localDayKey(d);
}

function parseDayKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export function TasksPage({ mode = 'all' }: { mode?: 'all' | 'mine' }) {
	const { user } = useCurrentUser();
	const navigate = useNavigate();
	const isMobile = useMediaQuery(AG_GRID_MOBILE_MQ);
	const [newTaskOpen, setNewTaskOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
	const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [hideDelivery, setHideDelivery] = useState(false);
	const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [visibleColumns, setVisibleColumns] = useState<TaskColumnField[]>(
		readVisibleTaskColumns,
	);
	const gridApiRef = useRef<GridApi<Task> | null>(null);

	const defaultColDef = useMemo(() => getDefaultColDef(isMobile), [isMobile]);

	const columnDefs = useMemo(
		() =>
			getTaskColumnDefs(
				isMobile ? DEFAULT_VISIBLE_TASK_COLUMNS : visibleColumns,
			),
		[isMobile, visibleColumns],
	);

	const toggleColumn = (field: TaskColumnField, checked: boolean) => {
		const option = TASK_COLUMN_OPTIONS.find((o) => o.field === field);
		if (option?.required) return;
		setVisibleColumns((prev) => {
			const next = writeVisibleTaskColumns(
				checked ? [...prev, field] : prev.filter((f) => f !== field),
			);
			queueMicrotask(() => gridApiRef.current?.sizeColumnsToFit());
			return next;
		});
	};

	const taskDayKeys = useMemo(() => {
		if (mode !== 'mine') return [] as string[];
		const keys = new Set<string>();
		for (const task of tasks) {
			const key = dayKeyFromIso(task.windowStartAt);
			if (key) keys.add(key);
		}
		return [...keys].sort();
	}, [tasks, mode]);

	useEffect(() => {
		if (mode !== 'mine' || taskDayKeys.length === 0) {
			setSelectedDayKey(null);
			return;
		}
		setSelectedDayKey((prev) => {
			if (prev && taskDayKeys.includes(prev)) return prev;
			const todayKey = localDayKey(new Date());
			if (taskDayKeys.includes(todayKey)) return todayKey;
			return taskDayKeys[0] ?? null;
		});
	}, [mode, taskDayKeys]);

	const visibleTasks = useMemo(() => {
		let next = tasks;
		if (mode === 'all' && hideDelivery) {
			next = next.filter((task) => task.taskType !== 'Delivery');
		}
		if (mode === 'mine' && isMobile && selectedDayKey) {
			const day = parseDayKey(selectedDayKey);
			next = next.filter((task) => isSameLocalDay(task.windowStartAt, day));
		}
		if (mode === 'mine') {
			next = [...next].sort(
				(a, b) => startTimeMs(a.windowStartAt) - startTimeMs(b.windowStartAt),
			);
		}
		return next;
	}, [tasks, mode, hideDelivery, isMobile, selectedDayKey]);

	const useCardView = mode === 'mine' && Boolean(isMobile);

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

	const handleSaveTask = async (
		values: NewTaskFormValues,
		_addAnother: boolean,
		pendingFiles: File[],
	) => {
		let taskId: number;
		if (editingTask) {
			await updateTask(editingTask.id, values);
			taskId = editingTask.id;
		} else {
			if (!user) {
				throw new Error('Select a user in the sidebar before saving a task');
			}
			const created = await createTask({
				...values,
				createdByUserId: user.id,
			});
			taskId = created.id;
		}

		if (pendingFiles.length > 0) {
			if (!user) {
				throw new Error('Select a user in the sidebar before uploading attachments');
			}
			for (const file of pendingFiles) {
				await uploadAttachment(taskId, file, user.id);
			}
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

	const editorInitialContactOptions = useMemo(() => {
		if (!editingTask) return null;
		return editingTask.contacts.map((c) => {
			const shortName = formatShortName(c.name);
			return {
				value: String(c.id),
				label: c.email ? `${shortName} (${c.email})` : shortName,
			};
		});
	}, [editingTask]);

	const pageTitle = mode === 'mine' ? 'My Tasks' : 'Tasks';

	return (
		<Box className='tasks-page'>
			<Group justify='space-between' mb='md' wrap='nowrap'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					{pageTitle}
				</Title>
				{mode === 'mine' ? (
					<Button variant='default' color='brand'>
						Show Today Only
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
				{!isMobile ? (
					<Menu shadow='md' width={220} closeOnItemClick={false}>
						<Menu.Target>
							<Button
								variant='default'
								color='brand'
								leftSection={<Columns3 size={18} />}
							>
								Columns
							</Button>
						</Menu.Target>
						<Menu.Dropdown>
							{TASK_COLUMN_OPTIONS.map((option) => (
								<Menu.Item key={option.field} component='div'>
									<Checkbox
										label={option.headerName}
										checked={visibleColumns.includes(option.field)}
										disabled={option.required}
										onChange={(e) =>
											toggleColumn(option.field, e.currentTarget.checked)
										}
									/>
								</Menu.Item>
							))}
						</Menu.Dropdown>
					</Menu>
				) : null}
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

			{useCardView && taskDayKeys.length > 0 ? (
				<div
					className='tasks-day-chips'
					role='tablist'
					aria-label='Filter tasks by day'
				>
					{taskDayKeys.map((key) => {
						const day = parseDayKey(key);
						const selected = key === selectedDayKey;
						return (
							<button
								key={key}
								type='button'
								role='tab'
								aria-selected={selected}
								className='tasks-day-chip'
								data-selected={selected || undefined}
								onClick={() => setSelectedDayKey(key)}
							>
								<span className='tasks-day-chip-month'>
									{MONTH_SHORT[day.getMonth()]}
								</span>
								<span className='tasks-day-chip-date'>{day.getDate()}</span>
							</button>
						);
					})}
				</div>
			) : null}

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
							onGridReady={(e) => {
								gridApiRef.current = e.api;
							}}
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
				initialContactOptions={editorInitialContactOptions}
				taskId={editingTask?.id ?? null}
				onSave={handleSaveTask}
			/>

			<TaskDetailModal
				taskId={detailTaskId}
				opened={!isMobile && detailTaskId != null}
				onClose={() => setDetailTaskId(null)}
				onEdit={handleEditTask}
				onDelete={handleDeleteTask}
				onStatusChange={(updated) => {
					setTasks((prev) =>
						prev.map((t) =>
							t.id === updated.id ? { ...t, status: updated.status } : t,
						),
					);
				}}
			/>
		</Box>
	);
}
