import { createElement } from 'react';
import type { ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import type { Address } from './api/addresses';
import type { Contact } from './api/contacts';
import { TaskStatusBadge } from './components/TaskStatusBadge';
import type { Task, TaskStatus } from './types/task';
import { formatShortName } from './formatName';
import { formatTimeAgo } from './formatTime';
import { htmlToPlainText } from './taskDescHtml';

/**
 * Mobile breakpoint for AG Grid pages — matches AppShell `sm`
 * (`max-width` just under 48em).
 */
export const AG_GRID_MOBILE_MQ = '(max-width: 47.9975em)';

const sharedDefaultColDef: ColDef = {
	sortable: true,
	resizable: true,
};

/** Desktop: filters enabled for denser data exploration. */
export const desktopDefaultColDef: ColDef = {
	...sharedDefaultColDef,
	filter: true,
};

/** Mobile: filters off — awkward on small touch screens. */
export const mobileDefaultColDef: ColDef = {
	...sharedDefaultColDef,
	filter: false,
};

export function getDefaultColDef(isMobile: boolean | undefined): ColDef {
	return isMobile ? mobileDefaultColDef : desktopDefaultColDef;
}

const emptyDash = <T>(p: ValueFormatterParams<T, string | null>) => {
	const value = p.value ?? '';
	return value.trim() ? value : '—';
};

export type TaskColumnField = keyof Pick<
	Task,
	| 'externalKey'
	| 'taskType'
	| 'destinationAddress'
	| 'windowStartAt'
	| 'status'
	| 'contactNames'
	| 'crewName'
	| 'windowEndAt'
	| 'description'
	| 'createdByName'
>;

export type TaskColumnOption = {
	field: TaskColumnField;
	headerName: string;
	required?: boolean;
};

export const REQUIRED_TASK_COLUMNS: TaskColumnField[] = ['externalKey'];

export const TASK_COLUMN_OPTIONS: TaskColumnOption[] = [
	{ field: 'externalKey', headerName: 'Job', required: true },
	{ field: 'taskType', headerName: 'Type' },
	{ field: 'destinationAddress', headerName: 'Destination' },
	{ field: 'windowStartAt', headerName: 'Start' },
	{ field: 'status', headerName: 'Status' },
	{ field: 'contactNames', headerName: 'Contacts' },
	{ field: 'crewName', headerName: 'Crew' },
	{ field: 'windowEndAt', headerName: 'End' },
	{ field: 'description', headerName: 'Description' },
	{ field: 'createdByName', headerName: 'Created by' },
];

export const DEFAULT_VISIBLE_TASK_COLUMNS: TaskColumnField[] = [
	'externalKey',
	'taskType',
	'destinationAddress',
	'windowStartAt',
];

export const TASK_COLUMNS_STORAGE_KEY = 'field:taskGridColumns';

const ALL_TASK_COLUMN_FIELDS = new Set(TASK_COLUMN_OPTIONS.map((o) => o.field));

function withRequiredColumns(fields: TaskColumnField[]): TaskColumnField[] {
	const next = new Set(fields);
	for (const required of REQUIRED_TASK_COLUMNS) {
		next.add(required);
	}
	// Preserve catalog order for stable grid/menu behavior.
	return TASK_COLUMN_OPTIONS.map((o) => o.field).filter((f) => next.has(f));
}

export function readVisibleTaskColumns(): TaskColumnField[] {
	try {
		const raw = localStorage.getItem(TASK_COLUMNS_STORAGE_KEY);
		if (!raw) return [...DEFAULT_VISIBLE_TASK_COLUMNS];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_TASK_COLUMNS];
		const fields = parsed.filter(
			(f): f is TaskColumnField =>
				typeof f === 'string' &&
				ALL_TASK_COLUMN_FIELDS.has(f as TaskColumnField),
		);
		if (fields.length === 0) return [...DEFAULT_VISIBLE_TASK_COLUMNS];
		return withRequiredColumns(fields);
	} catch {
		return [...DEFAULT_VISIBLE_TASK_COLUMNS];
	}
}

export function writeVisibleTaskColumns(
	fields: TaskColumnField[],
): TaskColumnField[] {
	const next = withRequiredColumns(fields);
	try {
		localStorage.setItem(TASK_COLUMNS_STORAGE_KEY, JSON.stringify(next));
	} catch {
		/* private mode / blocked storage */
	}
	return next;
}

const taskColumnDefsBase: ColDef<Task>[] = [
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
		minWidth: 72,
		flex: 0.5,
		suppressSizeToFit: true,
	},
	{
		field: 'taskType',
		headerName: 'Type',
		minWidth: 72,
		maxWidth: 100,
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
	{
		field: 'status',
		headerName: 'Status',
		minWidth: 110,
		flex: 0.8,
		cellRenderer: (params: ICellRendererParams<Task, TaskStatus>) => {
			const status = params.value;
			if (!status) return null;
			return createElement(TaskStatusBadge, { status });
		},
	},
	{
		field: 'contactNames',
		headerName: 'Contacts',
		valueFormatter: emptyDash,
		minWidth: 120,
		flex: 1.2,
	},
	{
		field: 'crewName',
		headerName: 'Crew',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1,
	},
	{
		field: 'windowEndAt',
		headerName: 'End',
		valueFormatter: (p: ValueFormatterParams<Task, string | null>) =>
			formatTimeAgo(p.value ?? null) ?? '',
		minWidth: 120,
		flex: 1.2,
	},
	{
		field: 'description',
		headerName: 'Description',
		valueFormatter: (p: ValueFormatterParams<Task, string>) => {
			const plain = htmlToPlainText(p.value ?? '');
			return plain || '—';
		},
		minWidth: 140,
		flex: 1.4,
	},
	{
		field: 'createdByName',
		headerName: 'Created by',
		valueFormatter: (p: ValueFormatterParams<Task, string>) => {
			const name = p.value?.trim();
			if (!name) return '—';
			return formatShortName(name);
		},
		minWidth: 100,
		flex: 1,
	},
];

/** Cancelled tasks are soft-deleted this long after cancelledAt. */
const CANCELLED_PURGE_MS = 7 * 24 * 60 * 60 * 1000;

function purgeAtFromCancelledAt(cancelledAt: string | null): string | null {
	if (!cancelledAt) return null;
	const ms = new Date(cancelledAt).getTime();
	if (Number.isNaN(ms)) return null;
	return new Date(ms + CANCELLED_PURGE_MS).toISOString();
}

const cancelledTtlColumnDef: ColDef<Task> = {
	colId: 'ttl',
	headerName: 'TTL',
	valueGetter: (p) => purgeAtFromCancelledAt(p.data?.cancelledAt ?? null),
	valueFormatter: (p: ValueFormatterParams<Task, string | null>) =>
		formatTimeAgo(p.value ?? null) ?? '—',
	minWidth: 100,
	flex: 0.8,
	sortable: true,
};

/** Full task column catalog (defaults visible until `getTaskColumnDefs` applies prefs). */
export const taskColumnDefs: ColDef<Task>[] = taskColumnDefsBase;

export function getTaskColumnDefs(
	visibleFields: readonly TaskColumnField[],
	opts?: { showCancelledTtl?: boolean },
): ColDef<Task>[] {
	const visible = new Set(withRequiredColumns([...visibleFields]));
	const cols = taskColumnDefsBase.map((col) => {
		const field = col.field as TaskColumnField | undefined;
		if (!field) return col;
		return {
			...col,
			hide: !visible.has(field),
		};
	});
	if (opts?.showCancelledTtl) {
		cols.unshift(cancelledTtlColumnDef);
	}
	return cols;
}

export const addressColumnDefs: ColDef<Address>[] = [
	{
		field: 'addressName',
		headerName: 'Name',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1.2,
	},
	{
		field: 'streetLine',
		headerName: 'Street',
		minWidth: 120,
		flex: 1.4,
	},
	{
		field: 'building',
		headerName: 'Building',
		valueFormatter: emptyDash,
		minWidth: 80,
		flex: 0.8,
	},
	{
		field: 'notes',
		headerName: 'Notes',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1.2,
	},
];

export const contactColumnDefs: ColDef<Contact>[] = [
	{
		field: 'name',
		headerName: 'Contact',
		minWidth: 100,
		flex: 1.2,
	},
	{
		field: 'title',
		headerName: 'Title',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1,
	},
	{
		field: 'phone',
		headerName: 'Phone',
		valueFormatter: emptyDash,
		minWidth: 88,
		flex: 0.8,
	},
	{
		field: 'email',
		headerName: 'Email',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1.2,
	},
];
