import { Capacitor } from '@capacitor/core';

/**
 * Resolve an API path for the current client.
 * - Web (Vite): relative `/api/...` (proxied to :3000)
 * - Android emulator: host loopback via 10.0.2.2
 * - iOS simulator: Mac localhost
 * Override with VITE_API_BASE (e.g. http://192.168.1.10:3000) for a physical device.
 */
export function apiUrl(path: string): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	const override = import.meta.env.VITE_API_BASE as string | undefined;
	if (override) {
		return `${override.replace(/\/$/, '')}${p}`;
	}
	if (!Capacitor.isNativePlatform()) {
		return p;
	}
	if (Capacitor.getPlatform() === 'android') {
		return `http://10.0.2.2:3000${p}`;
	}
	return `http://127.0.0.1:3000${p}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
	return fetch(apiUrl(path), init);
}
