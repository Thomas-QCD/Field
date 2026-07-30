import { Capacitor } from '@capacitor/core';

function isLoopbackHost(hostname: string): boolean {
	return (
		hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
	);
}

/**
 * Resolve an API path for the current client.
 * - Web on localhost (DEV): relative `/api/...` (Vite proxies to :3000)
 * - Capacitor live-reload / LAN browser (DEV): `http://<page-host>:3000/...`
 *   (bypasses Vite proxy — large JSON fails with ERR_INVALID_CHUNKED_ENCODING /
 *   ERR_CONTENT_LENGTH_MISMATCH on WebView)
 * - Bundled native Android: host loopback via 10.0.2.2
 * - Bundled native iOS simulator: Mac localhost
 * Override with VITE_API_BASE (e.g. http://192.168.1.10:3000 for a physical
 * device against local API, or https://d….cloudfront.net via `npm run cap:staging`).
 */
export function apiUrl(path: string): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	const override = import.meta.env.VITE_API_BASE as string | undefined;
	if (override) {
		return `${override.replace(/\/$/, '')}${p}`;
	}

	if (import.meta.env.DEV) {
		const host =
			typeof window !== 'undefined' ? window.location.hostname : 'localhost';
		const useViteProxy = !Capacitor.isNativePlatform() && isLoopbackHost(host);
		if (useViteProxy) {
			return p;
		}
		return `http://${host}:3000${p}`;
	}

	if (Capacitor.isNativePlatform()) {
		if (Capacitor.getPlatform() === 'android') {
			return `http://10.0.2.2:3000${p}`;
		}
		return `http://127.0.0.1:3000${p}`;
	}

	return p;
}

type AccessTokenProvider = () => Promise<string | null>;

let accessTokenProvider: AccessTokenProvider | null = null;

/** Register a Bearer token provider (Entra MSAL on web / device session on mobile). Pass null to clear. */
export function setAccessTokenProvider(provider: AccessTokenProvider | null) {
	accessTokenProvider = provider;
}

export async function apiFetch(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	const url = apiUrl(path);
	const headers = new Headers(init?.headers);

	if (accessTokenProvider && !headers.has('Authorization')) {
		const token = await accessTokenProvider();
		if (token) headers.set('Authorization', `Bearer ${token}`);
	}

	let res: Response;
	try {
		res = await fetch(url, { ...init, headers });
	} catch (err: unknown) {
		// React effect cleanup aborts in-flight requests — leave those alone.
		if (
			(err instanceof DOMException || err instanceof Error) &&
			err.name === 'AbortError'
		) {
			throw err;
		}
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`${reason} (${url})`);
	}

	if (
		res.status === 401 &&
		Capacitor.isNativePlatform() &&
		!path.includes('/api/mobile/activate')
	) {
		// Dynamic import avoids a circular dependency with mobileSession.
		const { clearMobileSession, getMobileSession } = await import(
			'../auth/mobileSession'
		);
		if (getMobileSession()) {
			await clearMobileSession();
		}
	}

	return res;
}
