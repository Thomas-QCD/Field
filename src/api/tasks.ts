import type {
	Task,
	TaskCompletionNote,
	TaskDetail,
	TaskStatus,
	TaskType,
} from '../types/task';
import { apiFetch } from './client';

export async function listTasks(
	signal?: AbortSignal,
	opts?: { crewMemberId?: string | null },
): Promise<Task[]> {
	const params = new URLSearchParams();
	if (opts?.crewMemberId) params.set('crewMemberId', opts.crewMemberId);
	const qs = params.toString();
	const res = await apiFetch(`/api/tasks${qs ? `?${qs}` : ''}`, { signal });
	const data = (await res.json().catch(() => ({}))) as {
		tasks?: Task[];
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `List tasks failed (${res.status})`);
	}
	return data.tasks ?? [];
}

export async function getTask(
	id: number,
	signal?: AbortSignal,
): Promise<TaskDetail> {
	const res = await apiFetch(`/api/tasks/${id}`, { signal });
	const data = (await res.json().catch(() => ({}))) as {
		task?: TaskDetail;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Get task failed (${res.status})`);
	}
	if (!data.task) {
		throw new Error('Get task failed: empty response');
	}
	return data.task;
}

export interface CreateTaskInput {
	createdByUserId: string;
	contactIds: number[];
	pocContactId: number | null;
	taskType: TaskType;
	externalKey: string;
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
	canStartEarly: string;
	isTimeSpecific: string;
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

	const data = (await res.json().catch(() => ({}))) as {
		task?: CreatedTask;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Create task failed (${res.status})`);
	}
	if (!data.task) {
		throw new Error('Create task failed: empty response');
	}
	return data.task;
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

	const data = (await res.json().catch(() => ({}))) as {
		task?: CreatedTask;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Update task failed (${res.status})`);
	}
	if (!data.task) {
		throw new Error('Update task failed: empty response');
	}
	return data.task;
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

	const data = (await res.json().catch(() => ({}))) as {
		task?: {
			id: number;
			status: TaskStatus;
			completedAt?: string | null;
			completedNotes?: string | null;
			failedReason?: string | null;
			completionNotes?: TaskCompletionNote[];
			completionNotesByName?: string | null;
		};
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Update status failed (${res.status})`);
	}
	if (!data.task) {
		throw new Error('Update status failed: empty response');
	}
	return {
		id: data.task.id,
		status: data.task.status,
		completedAt: data.task.completedAt ?? null,
		completedNotes: data.task.completedNotes ?? null,
		failedReason: data.task.failedReason ?? null,
		completionNotes: data.task.completionNotes ?? [],
		completionNotesByName: data.task.completionNotesByName ?? null,
	};
}

export type CrewEventType = 'started' | 'ended';
export type CrewEventOutcome = 'Completed' | 'Failed';

export interface CreateCrewEventInput {
	userId: string;
	eventType: CrewEventType;
	outcome?: CrewEventOutcome;
	notes?: string;
	latitude?: number | null;
	longitude?: number | null;
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

	const data = (await res.json().catch(() => ({}))) as {
		event?: CrewEvent;
		task?: {
			id: number;
			status: TaskStatus;
			completedAt: string | null;
			completedNotes?: string | null;
			failedReason?: string | null;
			completionNotes?: TaskCompletionNote[];
		};
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Crew event failed (${res.status})`);
	}
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
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error ?? `Cancel task failed (${res.status})`);
	}
}

export async function restoreTask(
	id: number,
): Promise<{ id: number; status: TaskStatus }> {
	const res = await apiFetch(`/api/tasks/${id}/restore`, { method: 'POST' });
	const data = (await res.json().catch(() => ({}))) as {
		error?: string;
		task?: { id: number; status: TaskStatus };
	};
	if (!res.ok) {
		throw new Error(data.error ?? `Restore task failed (${res.status})`);
	}
	if (!data.task) {
		throw new Error('Restore task failed: empty response');
	}
	return data.task;
}

/** Fetch delivery docket PDF and open it in a new tab for viewing/printing (no download). */
export async function openDeliveryDocket(taskId: number): Promise<void> {
	// Open on the user gesture so the tab is not blocked; navigate once the PDF is ready.
	const printWindow = window.open('about:blank', '_blank');
	try {
		const res = await apiFetch(`/api/tasks/${taskId}/delivery-docket`);
		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
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


