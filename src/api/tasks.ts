import type { Task, TaskDetail, TaskStatus, TaskType } from '../types/task';
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
): Promise<{ id: number; status: TaskStatus }> {
	const res = await apiFetch(`/api/tasks/${id}/status`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ status }),
	});

	const data = (await res.json().catch(() => ({}))) as {
		task?: { id: number; status: TaskStatus };
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Update status failed (${res.status})`);
	}
	if (!data.task) {
		throw new Error('Update status failed: empty response');
	}
	return data.task;
}

export async function deleteTask(id: number): Promise<void> {
	const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error ?? `Delete task failed (${res.status})`);
	}
}
