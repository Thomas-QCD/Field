import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Center, Loader, Text } from '@mantine/core';
import { Capacitor } from '@capacitor/core';
import {
	AuthenticatedTemplate,
	MsalProvider,
	UnauthenticatedTemplate,
	useMsal,
} from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { setAccessTokenProvider } from '../api/client';
import { isEntraConfigured } from './config';
import { LoginPage } from './LoginPage';
import { getMsalInstance } from './msalConfig';
import { acquireIdToken } from './token';

function EntraTokenBridge({ children }: { children: ReactNode }) {
	const { instance, accounts, inProgress } = useMsal();

	useLayoutEffect(() => {
		const account = instance.getActiveAccount() ?? accounts[0] ?? null;
		if (account && !instance.getActiveAccount()) {
			instance.setActiveAccount(account);
		}

		setAccessTokenProvider(async () => {
			const active =
				instance.getActiveAccount() ?? instance.getAllAccounts()[0];
			if (!active) return null;
			try {
				return await acquireIdToken(instance, active);
			} catch {
				return null;
			}
		});

		return () => setAccessTokenProvider(null);
	}, [instance, accounts]);

	if (
		inProgress === InteractionStatus.Startup ||
		inProgress === InteractionStatus.HandleRedirect
	) {
		return (
			<Center mih='100dvh'>
				<Loader size='sm' />
			</Center>
		);
	}

	return <>{children}</>;
}

function EntraAuthGate({ children }: { children: ReactNode }) {
	return (
		<EntraTokenBridge>
			<AuthenticatedTemplate>{children}</AuthenticatedTemplate>
			<UnauthenticatedTemplate>
				<LoginPage />
			</UnauthenticatedTemplate>
		</EntraTokenBridge>
	);
}

/**
 * Web + Entra: MSAL gate. Capacitor: children (QR gate is MobileAuthGate).
 * Unset Entra on web: children (stub user picker).
 */
export function AuthRoot({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(!isEntraConfigured());
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (Capacitor.isNativePlatform() || !isEntraConfigured()) {
			setReady(true);
			return;
		}

		let cancelled = false;
		const instance = getMsalInstance();

		void instance
			.initialize()
			.then(() => instance.handleRedirectPromise())
			.then((result) => {
				if (cancelled) return;
				if (result?.account) {
					instance.setActiveAccount(result.account);
				} else if (!instance.getActiveAccount()) {
					const existing = instance.getAllAccounts()[0];
					if (existing) instance.setActiveAccount(existing);
				}
				setReady(true);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				console.error(err);
				setError(err instanceof Error ? err.message : 'MSAL init failed');
				setReady(true);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	if (Capacitor.isNativePlatform() || !isEntraConfigured()) {
		return <>{children}</>;
	}

	if (!ready) {
		return (
			<Center mih='100dvh'>
				<Loader size='sm' />
			</Center>
		);
	}

	if (error) {
		return (
			<Center mih='100dvh' px='md'>
				<Text c='red'>{error}</Text>
			</Center>
		);
	}

	return (
		<MsalProvider instance={getMsalInstance()}>
			<EntraAuthGate>{children}</EntraAuthGate>
		</MsalProvider>
	);
}
