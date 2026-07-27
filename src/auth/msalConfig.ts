import {
	type Configuration,
	LogLevel,
	PublicClientApplication,
} from '@azure/msal-browser';
import { isEntraConfigured } from './config';

function buildMsalConfig(): Configuration {
	const clientId = (import.meta.env.VITE_AZURE_CLIENT_ID as string).trim();
	const tenantId = (import.meta.env.VITE_AZURE_TENANT_ID as string).trim();
	const redirectUri =
		typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

	return {
		auth: {
			clientId,
			authority: `https://login.microsoftonline.com/${tenantId}`,
			redirectUri,
			postLogoutRedirectUri: redirectUri,
		},
		cache: {
			cacheLocation: 'sessionStorage',
		},
		system: {
			loggerOptions: {
				logLevel: LogLevel.Warning,
				loggerCallback: (_level, message, containsPii) => {
					if (!containsPii) console.debug('[msal]', message);
				},
			},
		},
	};
}

export const loginRequest = {
	scopes: ['openid', 'profile', 'email', 'User.Read'],
};

let pca: PublicClientApplication | null = null;

export function getMsalInstance(): PublicClientApplication {
	if (!isEntraConfigured()) {
		throw new Error('Entra ID is not configured');
	}
	if (!pca) {
		pca = new PublicClientApplication(buildMsalConfig());
	}
	return pca;
}
