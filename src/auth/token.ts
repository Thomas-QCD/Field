import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';

/** Acquire an ID token to send as Bearer to the Field API. */
export async function acquireIdToken(
	instance: IPublicClientApplication,
	account: AccountInfo,
): Promise<string> {
	const result = await instance.acquireTokenSilent({
		...loginRequest,
		account,
	});
	if (!result.idToken) {
		throw new Error('No ID token returned from Entra');
	}
	return result.idToken;
}
