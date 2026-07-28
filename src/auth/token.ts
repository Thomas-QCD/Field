import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';

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

/** @deprecated Use needsInteractiveLogin */
export const isInteractionRequired = needsInteractiveLogin;

let inFlight: Promise<string> | null = null;
let inFlightAccountId: string | null = null;

/**
 * Acquire an ID token for the Field API Bearer header.
 * Concurrent callers for the same account share one MSAL silent request
 * (avoids block_iframe_reload under Strict Mode).
 */
export async function acquireIdToken(
	instance: IPublicClientApplication,
	account: AccountInfo,
): Promise<string> {
	const accountId = account.homeAccountId;
	if (inFlight && inFlightAccountId === accountId) {
		return inFlight;
	}

	inFlightAccountId = accountId;
	inFlight = (async () => {
		const result = await instance.acquireTokenSilent({
			...loginRequest,
			account,
		});
		if (!result.idToken) {
			throw new Error('No ID token returned from Entra');
		}
		return result.idToken;
	})().finally(() => {
		inFlight = null;
		inFlightAccountId = null;
	});

	return inFlight;
}
