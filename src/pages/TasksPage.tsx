import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
	Alert,
	Button,
	Checkbox,
	Group,
	Loader,
	Menu,
	SegmentedControl,
	Title,
	Box,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Columns3, Plus } from 'lucide-react';
import type { GridApi, RowClickedEvent } from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import {
	createTask,
	deleteTask,
	listTasks,
	restoreTask,
	updateTask,
} from '../api/tasks';
import { uploadAttachment } from '../api/attachments';
import { useCurrentUser } from '../context/CurrentUserContext';
import type { Task, TaskDetail, TaskStatus } from '../types/task';
import {
	NewTaskModal,
	type NewTaskFormValues,
} from '../components/NewTaskModal';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { TaskCards } from '../components/TaskCards';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { useFieldPullToRefresh } from '../hooks/useFieldPullToRefresh';
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

/** Desktop list filter tabs (label → matching task statuses). */
const STATUS_TABS = [
	{ value: 'in_progress', label: 'In Progress', statuses: ['In Progress'] },
	{ value: 'completed', label: 'Completed', statuses: ['Completed'] },
	{ value: 'failed', label: 'Failed', statuses: ['Failed'] },
	{
		value: 'undetermined',
		label: 'Undetermined',
		statuses: ['Undetermined'],
	},
	{
		value: 'upcoming',
		label: 'Upcoming',
		statuses: ['Unassigned', 'Assigned', 'Loaded'],
	},
	{ value: 'cancelled', label: 'Cancelled', statuses: ['Cancelled'] },
] as const satisfies ReadonlyArray<{
	value: string;
	label: string;
	statuses: readonly TaskStatus[];
}>;

/** Delivery: Loaded is the active-work bucket (same role as In Progress). */
const DELIVERY_STATUS_TABS = [
	{
		value: 'loaded',
		label: 'Loaded',
		statuses: ['Loaded'],
	},
	{ value: 'completed', label: 'Completed', statuses: ['Completed'] },
	{ value: 'failed', label: 'Failed', statuses: ['Failed'] },
	{
		value: 'undetermined',
		label: 'Undetermined',
		statuses: ['Undetermined'],
	},
	{
		value: 'upcoming',
		label: 'Upcoming',
		statuses: ['Unassigned', 'Assigned'],
	},
	{ value: 'cancelled', label: 'Cancelled', statuses: ['Cancelled'] },
] as const satisfies ReadonlyArray<{
	value: string;
	label: string;
	statuses: readonly TaskStatus[];
}>;

type StatusTabValue =
	| (typeof STATUS_TABS)[number]['value']
	| (typeof DELIVERY_STATUS_TABS)[number]['value'];

type StatusTabDef = {
	value: StatusTabValue;
	label: string;
	statuses: readonly TaskStatus[];
};

function statusTabsForMode(mode: 'all' | 'mine' | 'delivery'): StatusTabDef[] {
	return mode === 'delivery' ? [...DELIVERY_STATUS_TABS] : [...STATUS_TABS];
}

function defaultStatusTab(mode: 'all' | 'mine' | 'delivery'): StatusTabValue {
	return mode === 'delivery' ? 'loaded' : 'in_progress';
}

function matchesStatusTab(status: TaskStatus, tab: StatusTabDef): boolean {
	return tab.statuses.includes(status);
}

const DAY_FILTER_OPTIONS = [
	{ label: 'All', value: 'all' },
	{ label: 'Today', value: 'today' },
	{ label: 'Tomorrow', value: 'tomorrow' },
] as const;

type DayFilterValue = (typeof DAY_FILTER_OPTIONS)[number]['value'];

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
	// POC first so list order matches “first = POC”.
	const contacts = [...task.contacts].sort(
		(a, b) => Number(b.isPoc) - Number(a.isPoc),
	);
	const contactIds = contacts.map((c) => c.id);
	return {
		contactIds,
		pocContactId: contactIds[0] ?? null,
		receiveEmailContactIds: contacts
			.filter((c) => c.receivesEmail)
			.map((c) => c.id),
		taskType: task.taskType,
		externalKey: task.externalKey,
		jobTitle: task.jobTitle ?? '',
		taskDesc: task.description,
		destinationAddressId: task.destinationAddressId,
		destinationAddressName: task.destinationAddressName,
		destinationAddress: task.destinationAddress,
		destinationBuilding: task.destinationBuilding,
		destinationNotes: task.destinationNotes,
		afterDateTime: toDateTimeLocal(task.windowStartAt),
		beforeDateTime: toDateTimeLocal(task.windowEndAt),
		crewMemberIds: [...task.crewMembers]
			.sort((a, b) => Number(b.isLead) - Number(a.isLead))
			.map((m) => m.id),
		leadCrewMemberId:
			task.crewMembers.find((m) => m.isLead)?.id ??
			task.crewMembers[0]?.id ??
			null,
		guys: task.crewSize ?? '',
		hours: task.estimatedHours ?? '',
		canStartEarly: task.canStartEarly,
		isTimeSpecific: task.isTimeSpecific,
		isUrgent: task.isUrgent,
		equipment: task.equipment ?? [],
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

export function TasksPage({
	mode = 'all',
}: {
	mode?: 'all' | 'mine' | 'delivery';
}) {
	const { user } = useCurrentUser();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const isMobile = useMediaQuery(AG_GRID_MOBILE_MQ);
	const [newTaskOpen, setNewTaskOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TaskDetail | null>(null);
	const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
	const [dayFilter, setDayFilter] = useState<DayFilterValue>('all');
	const [statusTab, setStatusTab] = useState<StatusTabValue>(() =>
		defaultStatusTab(mode),
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [visibleColumns, setVisibleColumns] = useState<TaskColumnField[]>(
		readVisibleTaskColumns,
	);
	const gridApiRef = useRef<GridApi<Task> | null>(null);
	const gridWrapRef = useRef<HTMLDivElement | null>(null);

	const dayFromQuery = useMemo(() => {
		if (mode !== 'mine') return null;
		const raw = searchParams.get('day');
		if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
		return raw;
	}, [mode, searchParams]);

	const defaultColDef = useMemo(() => getDefaultColDef(isMobile), [isMobile]);

	const columnDefs = useMemo(
		() =>
			getTaskColumnDefs(
				isMobile ? DEFAULT_VISIBLE_TASK_COLUMNS : visibleColumns,
				{ showCancelledTtl: statusTab === 'cancelled' },
			),
		[isMobile, visibleColumns, statusTab],
	);

	useEffect(() => {
		queueMicrotask(() => gridApiRef.current?.sizeColumnsToFit());
	}, [statusTab, columnDefs]);

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

	const showStatusTabs = !isMobile;
	const useCardView = mode === 'mine' && Boolean(isMobile);
	/** Mobile My Tasks uses day chips instead of All / Today / Tomorrow. */
	const showDayFilter = !useCardView;

	const taskDayKeys = useMemo(() => {
		if (mode !== 'mine') return [] as string[];
		const keys = new Set<string>();
		for (const task of tasks) {
			const key = dayKeyFromIso(task.windowStartAt);
			if (key) keys.add(key);
		}
		if (dayFromQuery) keys.add(dayFromQuery);
		return [...keys].sort();
	}, [tasks, mode, dayFromQuery]);

	/** Resolve day on render so cards never flash every day before useEffect runs. */
	const activeDayKey = useMemo(() => {
		if (!useCardView || taskDayKeys.length === 0) return null;
		if (dayFromQuery && taskDayKeys.includes(dayFromQuery)) return dayFromQuery;
		if (selectedDayKey && taskDayKeys.includes(selectedDayKey)) {
			return selectedDayKey;
		}
		const todayKey = localDayKey(new Date());
		if (taskDayKeys.includes(todayKey)) return todayKey;
		return taskDayKeys[0] ?? null;
	}, [useCardView, taskDayKeys, dayFromQuery, selectedDayKey]);

	useEffect(() => {
		if (mode !== 'mine' || taskDayKeys.length === 0) {
			setSelectedDayKey(null);
			return;
		}
		setSelectedDayKey(activeDayKey);
	}, [mode, taskDayKeys, activeDayKey]);

	/** Cancelled tab only on desktop All Tasks / Delivery — not member lists. */
	const visibleStatusTabs = useMemo(() => {
		const tabs = statusTabsForMode(mode);
		return mode === 'mine'
			? tabs.filter((tab) => tab.value !== 'cancelled')
			: tabs;
	}, [mode]);

	useEffect(() => {
		if (
			mode === 'mine' &&
			statusTab === 'cancelled' &&
			visibleStatusTabs.length > 0
		) {
			setStatusTab(defaultStatusTab(mode));
		}
	}, [mode, statusTab, visibleStatusTabs]);

	useEffect(() => {
		const allowed = new Set(visibleStatusTabs.map((tab) => tab.value));
		if (!allowed.has(statusTab)) {
			setStatusTab(defaultStatusTab(mode));
		}
	}, [mode, statusTab, visibleStatusTabs]);

	/** Tasks in the current page scope (mode + day), before status-tab filter. */
	const scopedTasks = useMemo(() => {
		let next = tasks;
		if (mode === 'all') {
			next = next.filter((task) => task.taskType !== 'Delivery');
		} else if (mode === 'delivery') {
			next = next.filter((task) => task.taskType === 'Delivery');
		}
		// Member lists never include cancelled tasks.
		if (mode === 'mine') {
			next = next.filter((task) => task.status !== 'Cancelled');
		}
		if (useCardView && activeDayKey) {
			const day = parseDayKey(activeDayKey);
			next = next.filter((task) => isSameLocalDay(task.windowStartAt, day));
		} else if (dayFilter === 'today' || dayFilter === 'tomorrow') {
			const day = new Date();
			if (dayFilter === 'tomorrow') day.setDate(day.getDate() + 1);
			next = next.filter((task) => isSameLocalDay(task.windowStartAt, day));
		}
		return next;
	}, [tasks, mode, useCardView, activeDayKey, dayFilter]);

	const statusTabCounts = useMemo(() => {
		const counts = {} as Record<StatusTabValue, number>;
		for (const tab of visibleStatusTabs) {
			counts[tab.value] = 0;
		}
		for (const task of scopedTasks) {
			for (const tab of visibleStatusTabs) {
				if (matchesStatusTab(task.status, tab)) {
					counts[tab.value] += 1;
					break;
				}
			}
		}
		return counts;
	}, [scopedTasks, visibleStatusTabs]);

	/** Leave empty tabs: pick the first tab that still has tasks. */
	useEffect(() => {
		if (!showStatusTabs) return;
		if ((statusTabCounts[statusTab] ?? 0) > 0) return;
		const fallback = visibleStatusTabs.find(
			(tab) => (statusTabCounts[tab.value] ?? 0) > 0,
		);
		if (fallback && fallback.value !== statusTab) {
			setStatusTab(fallback.value);
		}
	}, [showStatusTabs, statusTab, statusTabCounts, visibleStatusTabs]);

	const visibleTasks = useMemo(() => {
		let next = scopedTasks;
		if (showStatusTabs) {
			const tab = visibleStatusTabs.find((t) => t.value === statusTab);
			if (tab) {
				next = next.filter((task) => matchesStatusTab(task.status, tab));
			}
		}
		if (mode === 'mine') {
			next = [...next].sort(
				(a, b) => startTimeMs(a.windowStartAt) - startTimeMs(b.windowStartAt),
			);
		}
		return next;
	}, [scopedTasks, showStatusTabs, statusTab, visibleStatusTabs, mode]);

	const crewMemberId = mode === 'mine' ? (user?.id ?? null) : null;
	/** Desktop My Tasks: also include tasks the user created. Mobile stays assigned-only. */
	const createdByUserId =
		mode === 'mine' && !isMobile ? (user?.id ?? null) : null;

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
					createdByUserId: createdByUserId ?? undefined,
				});
				if (!signal?.aborted) setTasks(next);
			} catch (err: unknown) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load tasks');
			} finally {
				if (!signal?.aborted) setLoading(false);
			}
		},
		[mode, crewMemberId, createdByUserId],
	);

	useEffect(() => {
		// TasksPage is reused across /tasks ↔ /my-tasks (same component type).
		// Drop prior rows immediately so All Tasks never flash inside My Tasks.
		setTasks([]);
		setLoading(true);
		setError(null);
		const controller = new AbortController();
		void refreshTasks(controller.signal);
		return () => controller.abort();
	}, [refreshTasks]);

	const ptrEnabled = Boolean(isMobile) && (useCardView || mode === 'all');
	const {
		scrollRef: ptrScrollRef,
		setScrollElement: setPtrScrollElement,
		pullPosition,
		isRefreshing: ptrRefreshing,
	} = useFieldPullToRefresh({
		enabled: ptrEnabled,
		onRefresh: refreshTasks,
	});

	useEffect(() => {
		return () => setPtrScrollElement(null);
	}, [setPtrScrollElement]);

	const bindGridViewport = () => {
		const viewport = gridWrapRef.current?.querySelector(
			'.ag-body-viewport',
		) as HTMLElement | null;
		setPtrScrollElement(viewport);
	};

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
				throw new Error(
					'Select a user in the sidebar before uploading attachments',
				);
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

	const handleRestoreTask = async (task: TaskDetail) => {
		await restoreTask(task.id);
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
			const name = c.name.trim();
			return {
				value: String(c.id),
				label: c.email ? `${name} (${c.email})` : name,
			};
		});
	}, [editingTask]);

	const pageTitle =
		mode === 'mine' ? 'My Tasks' : mode === 'delivery' ? 'Delivery' : 'Tasks';

	return (
		<Box className='tasks-page'>
			{ptrEnabled ? (
				<PullToRefreshIndicator
					pullPosition={pullPosition}
					isRefreshing={ptrRefreshing}
				/>
			) : null}
			<Group justify='space-between' mb='md' wrap='nowrap' gap='sm'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					{pageTitle}
				</Title>
				<Group gap='sm' wrap='nowrap'>
					{showDayFilter ? (
						<SegmentedControl
							value={dayFilter}
							onChange={(value) => setDayFilter(value as DayFilterValue)}
							data={[...DAY_FILTER_OPTIONS]}
							radius='md'
							color='brand'
							aria-label='Filter tasks by start day'
						/>
					) : null}
					{!isMobile && mode !== 'mine' ? (
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
					{!isMobile ? (
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
			</Group>

			{showStatusTabs ? (
				<div
					className='tasks-status-tabs'
					role='tablist'
					aria-label='Filter tasks by status'
				>
					{visibleStatusTabs.map((tab) => {
						const selected = tab.value === statusTab;
						const count = statusTabCounts[tab.value] ?? 0;
						const empty = count === 0;
						return (
							<button
								key={tab.value}
								type='button'
								role='tab'
								aria-selected={selected}
								aria-disabled={empty || undefined}
								className='tasks-status-tab'
								data-selected={selected || undefined}
								disabled={empty}
								onClick={() => {
									if (!empty) setStatusTab(tab.value);
								}}
							>
								{tab.label} ({count})
							</button>
						);
					})}
				</div>
			) : null}

					{useCardView && taskDayKeys.length > 0 ? (
				<div
					className='tasks-day-chips'
					role='tablist'
					aria-label='Filter tasks by day'
				>
					{taskDayKeys.map((key) => {
						const day = parseDayKey(key);
						const selected = key === activeDayKey;
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
				<Box ref={ptrScrollRef} className='tasks-cards-wrap'>
					<TaskCards tasks={visibleTasks} onSelect={openTask} />
				</Box>
			) : (
				<Box
					ref={gridWrapRef}
					className='tasks-grid-wrap ag-theme-quartz'
				>
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
								if (ptrEnabled) bindGridViewport();
							}}
							onGridSizeChanged={(e) => e.api.sizeColumnsToFit()}
							onFirstDataRendered={(e) => {
								e.api.sizeColumnsToFit();
								if (ptrEnabled) bindGridViewport();
							}}
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
				onRestore={handleRestoreTask}
				onStatusChange={(updated) => {
					setTasks((prev) =>
						prev.map((t) =>
							t.id === updated.id ? { ...t, status: updated.status } : t,
						),
					);
				}}
				onCloned={async (newTaskId) => {
					await refreshTasks();
					setDetailTaskId(newTaskId);
				}}
			/>
		</Box>
	);
}
