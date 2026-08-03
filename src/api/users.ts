import { apiFetch, expectJsonField, expectOk } from './client';

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
	const data = await expectOk<{ users?: AppUser[] }>(res, 'Users list failed');
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
	return expectJsonField(res, 'user', 'Session sync failed');
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
	return expectOk(res, 'Issue activation failed');
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
	const data = await expectOk<{ devices?: MobileDevice[] }>(
		res,
		'List mobile devices failed',
	);
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
	return expectJsonField(res, 'device', 'Revoke device failed');
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
	return expectOk(res, 'Revoke all devices failed');
}
