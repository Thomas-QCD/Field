import { Capacitor } from '@capacitor/core';

/**
 * Resolve an API path for the current client.
 * - Web / Vite live-reload (DEV): relative `/api/...` (proxied to :3000)
 * - Bundled native Android: host loopback via 10.0.2.2
 * - Bundled native iOS simulator: Mac localhost
 * Override with VITE_API_BASE (e.g. http://192.168.1.10:3000) for a physical device.
 */
export function apiUrl(path: string): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	const override = import.meta.env.VITE_API_BASE as string | undefined;
	if (override) {
		return `${override.replace(/\/$/, '')}${p}`;
	}
	// Browser and Capacitor live-reload both load from Vite — use the proxy.
	if (!Capacitor.isNativePlatform() || import.meta.env.DEV) {
		return p;
	}
	if (Capacitor.getPlatform() === 'android') {
		return `http://10.0.2.2:3000${p}`;
	}
	return `http://127.0.0.1:3000${p}`;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
	const url = apiUrl(path);
	return fetch(url, init).catch((err: unknown) => {
		// React effect cleanup aborts in-flight requests — leave those alone.
		if (
			(err instanceof DOMException || err instanceof Error) &&
			err.name === 'AbortError'
		) {
			throw err;
		}
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`${reason} (${url})`);
	});
}
