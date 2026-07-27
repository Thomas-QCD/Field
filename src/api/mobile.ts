import { apiFetch } from './client';

export interface ActivateMobileResult {
	deviceSessionToken: string;
	userId: string;
	displayName: string;
	role: string;
	deviceId: string;
	activatedAt: string;
}

export async function activateMobile(
	code: string,
	opts?: { deviceLabel?: string; signal?: AbortSignal },
): Promise<ActivateMobileResult> {
	const res = await apiFetch('/api/mobile/activate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			code,
			deviceLabel: opts?.deviceLabel,
		}),
		signal: opts?.signal,
	});
	if (!res.ok) {
		const errBody = (await res.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(errBody?.error ?? `Activation failed (${res.status})`);
	}
	return (await res.json()) as ActivateMobileResult;
}
