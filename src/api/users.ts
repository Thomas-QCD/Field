import { apiFetch } from './client';

export interface AppUser {
	id: string;
	displayName: string;
	role: string;
}

export type CrewUser = AppUser;

async function fetchUsers(
	role: string | null,
	signal?: AbortSignal,
): Promise<AppUser[]> {
	const params = new URLSearchParams();
	if (role) params.set('role', role);
	const qs = params.toString();
	const res = await apiFetch(`/api/users${qs ? `?${qs}` : ''}`, { signal });
	if (!res.ok) {
		throw new Error(`Users list failed (${res.status})`);
	}
	const data = (await res.json()) as { users: AppUser[] };
	return data.users ?? [];
}

export function listUsers(signal?: AbortSignal): Promise<AppUser[]> {
	return fetchUsers(null, signal);
}

export function listCrewUsers(signal?: AbortSignal): Promise<AppUser[]> {
	return fetchUsers('crew', signal);
}
