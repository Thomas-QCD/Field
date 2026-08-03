import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';

/** Refresh a bit before real expiry so the API never sees a stale ID token. */
const ID_TOKEN_REFRESH_SKEW_SECONDS = 60;

/** Silent SSO failed in a way that needs a top-level redirect (not another iframe). */
export function needsInteractiveLogin(err: unknown): boolean {
	if (err instanceof InteractionRequiredAuthError) return true;
	if (err && typeof err === 'object' && 'errorCode' in err) {
		const code = String((err as { errorCode: unknown }).errorCode);
		return (
			code === 'interaction_required' ||
			code === 'login_required' ||
			code === 'consent_required' ||
			code === 'monitor_window_timeout' ||
			code === 'timed_out' ||
			code === 'iframe_closed_prematurely' ||
			// Concurrent silent iframe (e.g. React Strict Mode remount).
			code === 'block_iframe_reload'
		);
	}
	return false;
}

/**
 * Read JWT `exp` (seconds since epoch) without verifying the signature.
 * Returns null if the token is not a readable JWT.
 */
export function readJwtExp(token: string): number | null {
	const parts = token.split('.');
	if (parts.length < 2 || !parts[1]) return null;
	try {
		const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
		const json = JSON.parse(atob(b64 + pad)) as { exp?: unknown };
		return typeof json.exp === 'number' && Number.isFinite(json.exp)
			? json.exp
			: null;
	} catch {
		return null;
	}
}

/** True when the ID token is usable for API calls (not expired / near expiry). */
export function isIdTokenFresh(
	token: string,
	skewSeconds: number = ID_TOKEN_REFRESH_SKEW_SECONDS,
): boolean {
	const exp = readJwtExp(token);
	if (exp == null) return false;
	return exp > Math.floor(Date.now() / 1000) + skewSeconds;
}

let inFlight: Promise<string> | null = null;
let inFlightAccountId: string | null = null;
let inFlightForceRefresh = false;

/**
 * Acquire an ID token for the Field API Bearer header.
 * Concurrent callers for the same account share one MSAL silent request
 * (avoids block_iframe_reload under Strict Mode).
 *
 * MSAL may return a cached result whose access token is still valid while the
 * ID token JWT is already past `exp`. We detect that and force a refresh.
 */
export async function acquireIdToken(
	instance: IPublicClientApplication,
	account: AccountInfo,
	opts?: { forceRefresh?: boolean },
): Promise<string> {
	const accountId = account.homeAccountId;
	const forceRefresh = opts?.forceRefresh === true;

	if (
		inFlight &&
		inFlightAccountId === accountId &&
		(!forceRefresh || inFlightForceRefresh)
	) {
		return inFlight;
	}

	inFlightAccountId = accountId;
	inFlightForceRefresh = forceRefresh;
	inFlight = (async () => {
		let result = await instance.acquireTokenSilent({
			...loginRequest,
			account,
			forceRefresh,
		});

		if (!result.idToken || !isIdTokenFresh(result.idToken)) {
			// Access-token cache hit can leave a stale ID token; bypass cache.
			result = await instance.acquireTokenSilent({
				...loginRequest,
				account,
				forceRefresh: true,
			});
		}

		if (!result.idToken) {
			throw new Error('No ID token returned from Entra');
		}
		if (!isIdTokenFresh(result.idToken, 0)) {
			throw new InteractionRequiredAuthError(
				'expired_token',
				'Entra ID token is still expired after refresh',
			);
		}
		return result.idToken;
	})().finally(() => {
		inFlight = null;
		inFlightAccountId = null;
		inFlightForceRefresh = false;
	});

	return inFlight;
}
