import { apiFetch } from './client';

export interface AppUser {
	id: string;
	displayName: string;
	role: string;
}

export type CrewUser = AppUser;

export interface MobileActivation {
	id: string;
	code: string;
	expiresAt: string;
	userId: string;
	displayName: string;
}

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

/** Upsert the signed-in Entra user and return the app user row. */
export async function syncSession(signal?: AbortSignal): Promise<AppUser> {
	const res = await apiFetch('/api/auth/session', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
		signal,
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(body?.error ?? `Session sync failed (${res.status})`);
	}
	const data = (await res.json()) as { user: AppUser };
	return data.user;
}

/** Issue a single-use mobile activation QR payload for a user. */
export async function issueMobileActivation(
	userId: string,
	opts?: { createdByUserId?: string; signal?: AbortSignal },
): Promise<MobileActivation> {
	const body: { createdByUserId?: string } = {};
	if (opts?.createdByUserId) {
		body.createdByUserId = opts.createdByUserId;
	}
	const res = await apiFetch(`/api/users/${userId}/mobile-activations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: opts?.signal,
	});
	if (!res.ok) {
		const errBody = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(
			errBody?.error ?? `Issue activation failed (${res.status})`,
		);
	}
	return (await res.json()) as MobileActivation;
}

export interface MobileDevice {
	id: string;
	userId: string;
	deviceLabel: string | null;
	activatedAt: string;
	lastSeenAt: string | null;
	revokedAt: string | null;
}

/** List mobile device sessions for a user. */
export async function listMobileDevices(
	userId: string,
	opts?: {
		actorUserId?: string;
		includeRevoked?: boolean;
		signal?: AbortSignal;
	},
): Promise<MobileDevice[]> {
	const params = new URLSearchParams();
	if (opts?.actorUserId) params.set('actorUserId', opts.actorUserId);
	if (opts?.includeRevoked) params.set('includeRevoked', '1');
	const qs = params.toString();
	const res = await apiFetch(
		`/api/users/${userId}/mobile-devices${qs ? `?${qs}` : ''}`,
		{ signal: opts?.signal },
	);
	if (!res.ok) {
		const errBody = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(
			errBody?.error ?? `List mobile devices failed (${res.status})`,
		);
	}
	const data = (await res.json()) as { devices: MobileDevice[] };
	return data.devices ?? [];
}

/** Revoke one mobile device session. */
export async function revokeMobileDevice(
	userId: string,
	deviceId: string,
	opts?: { revokedByUserId?: string; signal?: AbortSignal },
): Promise<MobileDevice> {
	const body: { revokedByUserId?: string } = {};
	if (opts?.revokedByUserId) {
		body.revokedByUserId = opts.revokedByUserId;
	}
	const res = await apiFetch(
		`/api/users/${userId}/mobile-devices/${deviceId}`,
		{
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: opts?.signal,
		},
	);
	if (!res.ok) {
		const errBody = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(
			errBody?.error ?? `Revoke device failed (${res.status})`,
		);
	}
	const data = (await res.json()) as { device: MobileDevice };
	return data.device;
}

/** Revoke all active mobile device sessions for a user. */
export async function revokeAllMobileDevices(
	userId: string,
	opts?: { revokedByUserId?: string; signal?: AbortSignal },
): Promise<{ revokedCount: number }> {
	const body: { revokedByUserId?: string } = {};
	if (opts?.revokedByUserId) {
		body.revokedByUserId = opts.revokedByUserId;
	}
	const res = await apiFetch(`/api/users/${userId}/mobile-devices`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: opts?.signal,
	});
	if (!res.ok) {
		const errBody = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(
			errBody?.error ?? `Revoke all devices failed (${res.status})`,
		);
	}
	return (await res.json()) as { revokedCount: number };
}
