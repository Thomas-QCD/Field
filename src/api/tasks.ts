import type {
	Task,
	TaskCompletionNote,
	TaskDetail,
	TaskStatus,
	TaskType,
} from '../types/task';
import { apiFetch, expectJsonField, expectOk, readJson } from './client';

export async function listTasks(
	signal?: AbortSignal,
	opts?: { crewMemberId?: string | null; createdByUserId?: string | null },
): Promise<Task[]> {
	const params = new URLSearchParams();
	if (opts?.crewMemberId) params.set('crewMemberId', opts.crewMemberId);
	if (opts?.createdByUserId) {
		params.set('createdByUserId', opts.createdByUserId);
	}
	const qs = params.toString();
	const res = await apiFetch(`/api/tasks${qs ? `?${qs}` : ''}`, { signal });
	const data = await expectOk<{ tasks?: Task[] }>(res, 'List tasks failed');
	return data.tasks ?? [];
}

export async function getTask(
	id: number,
	signal?: AbortSignal,
): Promise<TaskDetail> {
	const res = await apiFetch(`/api/tasks/${id}`, { signal });
	return expectJsonField(res, 'task', 'Get task failed');
}

export type TaskHistoryEventType =
	| 'created'
	| 'status_changed'
	| 'crew_started'
	| 'crew_ended'
	| 'cancelled'
	| 'restored'
	| 'attachment_added'
	| 'document_generated'
	| 'email_sent'
	| 'note_added';

export interface TaskHistoryEvent {
	id: string;
	type: TaskHistoryEventType | string;
	at: string | null;
	actorName: string | null;
	fromStatus: string | null;
	toStatus: string | null;
	summary: string | null;
	detail: string | null;
	latitude: number | null;
	longitude: number | null;
	accuracyMeters: number | null;
	/** Set when multiple same-kind attachments were folded into one row. */
	count?: number | null;
}

export async function getTaskHistory(
	taskId: number,
	signal?: AbortSignal,
): Promise<TaskHistoryEvent[]> {
	const res = await apiFetch(`/api/tasks/${taskId}/history`, { signal });
	const data = await expectOk<{ events?: TaskHistoryEvent[] }>(
		res,
		'Get task history failed',
	);
	return data.events ?? [];
}

export interface CreateTaskInput {
	createdByUserId: string;
	contactIds: number[];
	pocContactId: number | null;
	taskType: TaskType;
	externalKey: string;
	jobTitle: string;
	taskDesc: string;
	destinationAddressId: number | null;
	destinationAddressName: string;
	destinationAddress: string;
	destinationBuilding: string;
	destinationNotes: string;
	afterDateTime: string;
	beforeDateTime: string;
	crewMemberIds: string[];
	guys: number | string;
	hours: number | string;
	canStartEarly: boolean;
	isTimeSpecific: boolean;
	isUrgent: boolean;
	equipment: string[];
}

export interface CreatedTask {
	id: number;
	status: TaskStatus;
	taskType: TaskType;
	destinationAddressId: number | null;
	contactIds: number[];
	pocContactId: number | null;
	crewMemberIds: string[];
}

export async function createTask(input: CreateTaskInput): Promise<CreatedTask> {
	const res = await apiFetch('/api/tasks', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	return expectJsonField(res, 'task', 'Create task failed');
}

export type UpdateTaskInput = Omit<CreateTaskInput, 'createdByUserId'>;

export async function updateTask(
	id: number,
	input: UpdateTaskInput,
): Promise<CreatedTask> {
	const res = await apiFetch(`/api/tasks/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	return expectJsonField(res, 'task', 'Update task failed');
}

export async function updateTaskStatus(
	id: number,
	status: TaskStatus,
	opts?: { notes?: string; userId?: string },
): Promise<{
	id: number;
	status: TaskStatus;
	completedAt: string | null;
	completedNotes: string | null;
	failedReason: string | null;
	completionNotes: TaskCompletionNote[];
	completionNotesByName: string | null;
}> {
	const res = await apiFetch(`/api/tasks/${id}/status`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			status,
			...(opts && 'notes' in opts ? { notes: opts.notes ?? '' } : {}),
			...(opts?.userId ? { userId: opts.userId } : {}),
		}),
	});
	const data = await expectJsonField<{
		id: number;
		status: TaskStatus;
		completedAt?: string | null;
		completedNotes?: string | null;
		failedReason?: string | null;
		completionNotes?: TaskCompletionNote[];
		completionNotesByName?: string | null;
	}>(res, 'task', 'Update status failed');
	return {
		id: data.id,
		status: data.status,
		completedAt: data.completedAt ?? null,
		completedNotes: data.completedNotes ?? null,
		failedReason: data.failedReason ?? null,
		completionNotes: data.completionNotes ?? [],
		completionNotesByName: data.completionNotesByName ?? null,
	};
}

export type CrewEventType = 'started' | 'ended';
export type CrewEventOutcome = 'Completed' | 'Failed';

export interface CreateCrewEventInput {
	userId: string;
	eventType: CrewEventType;
	outcome?: CrewEventOutcome;
	notes?: string;
	latitude: number;
	longitude: number;
	accuracyMeters?: number | null;
	recordedAt?: string;
}

export interface CrewEvent {
	id: number;
	taskId: number;
	userId: string;
	eventType: CrewEventType;
	latitude: number | null;
	longitude: number | null;
	accuracyMeters: number | null;
	recordedAt: string;
	createdAt: string;
}

export async function createCrewEvent(
	taskId: number,
	input: CreateCrewEventInput,
): Promise<{
	event: CrewEvent;
	task: {
		id: number;
		status: TaskStatus;
		completedAt: string | null;
		completedNotes: string | null;
		failedReason: string | null;
		completionNotes: TaskCompletionNote[];
	};
}> {
	const res = await apiFetch(`/api/tasks/${taskId}/crew-events`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	const data = await expectOk<{
		event?: CrewEvent;
		task?: {
			id: number;
			status: TaskStatus;
			completedAt: string | null;
			completedNotes?: string | null;
			failedReason?: string | null;
			completionNotes?: TaskCompletionNote[];
		};
	}>(res, 'Crew event failed');
	if (!data.event || !data.task) {
		throw new Error('Crew event failed: empty response');
	}
	return {
		event: data.event,
		task: {
			id: data.task.id,
			status: data.task.status,
			completedAt: data.task.completedAt,
			completedNotes: data.task.completedNotes ?? null,
			failedReason: data.task.failedReason ?? null,
			completionNotes: data.task.completionNotes ?? [],
		},
	};
}

export async function deleteTask(id: number): Promise<void> {
	const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
	await expectOk(res, 'Cancel task failed');
}

export async function restoreTask(
	id: number,
): Promise<{ id: number; status: TaskStatus }> {
	const res = await apiFetch(`/api/tasks/${id}/restore`, { method: 'POST' });
	return expectJsonField(res, 'task', 'Restore task failed');
}

/** Fetch delivery docket PDF and open it in a new tab for viewing/printing (no download). */
export async function openDeliveryDocket(taskId: number): Promise<void> {
	// Open on the user gesture so the tab is not blocked; navigate once the PDF is ready.
	const printWindow = window.open('about:blank', '_blank');
	try {
		const res = await apiFetch(`/api/tasks/${taskId}/delivery-docket`);
		if (!res.ok) {
			const data = await readJson<{ error?: string }>(res);
			throw new Error(data.error ?? `Delivery docket failed (${res.status})`);
		}
		const buf = await res.arrayBuffer();
		const blob = new Blob([buf], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		if (printWindow) {
			printWindow.location.replace(url);
		} else {
			// Popup blocked — still view inline in this tab's history via temporary navigation is avoided;
			// open without features string so the browser shows the PDF viewer when possible.
			window.open(url, '_blank');
		}
		window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
	} catch (err) {
		printWindow?.close();
		throw err;
	}
}
