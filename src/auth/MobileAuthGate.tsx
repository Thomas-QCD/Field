import type { ReactNode } from 'react';
import { Center, Loader } from '@mantine/core';
import { Capacitor } from '@capacitor/core';
import { useCurrentUser } from '../context/CurrentUserContext';
import { MobileLoginPage } from './MobileLoginPage';

/**
 * Capacitor: require a QR device session before the app shell.
 * Web: pass through (Entra / stub handled by AuthRoot).
 */
export function MobileAuthGate({ children }: { children: ReactNode }) {
	const isNative = Capacitor.isNativePlatform();
	const { loading, mobileSession } = useCurrentUser();

	if (!isNative) {
		return <>{children}</>;
	}

	if (loading) {
		return (
			<Center mih='100dvh'>
				<Loader size='sm' />
			</Center>
		);
	}

	if (!mobileSession) {
		return <MobileLoginPage />;
	}

	return <>{children}</>;
}
