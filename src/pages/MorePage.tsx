import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
	Alert,
	Box,
	Button,
	Stack,
	Text,
	Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Capacitor } from '@capacitor/core';
import { LogOut, QrCode } from 'lucide-react';
import { activateFromQrScan } from '../auth/activateFromQr';
import { clearMobileSession } from '../auth/mobileSession';
import { UserSelect } from '../components/UserSelect';
import { useCurrentUser } from '../context/CurrentUserContext';

/** Mobile-only settings/account surface (user select, QR re-activate, etc.). */
export function MorePage() {
	const isDesktop = useMediaQuery('(min-width: 48em)');
	const isNative = Capacitor.isNativePlatform();
	const { mobileSession, refreshAfterMobileActivation } = useCurrentUser();
	const [scanning, setScanning] = useState(false);
	const [deactivating, setDeactivating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	if (isDesktop) {
		return <Navigate to='/' replace />;
	}

	const handleScanQr = async () => {
		setError(null);
		setSuccess(null);
		setScanning(true);
		try {
			const { displayName } = await activateFromQrScan();
			await refreshAfterMobileActivation();
			setSuccess(`Signed in as ${displayName}`);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to scan activation QR',
			);
		} finally {
			setScanning(false);
		}
	};

	const handleDeactivate = async () => {
		if (
			!window.confirm(
				'Clear this device session and return to QR activation?',
			)
		) {
			return;
		}
		setError(null);
		setSuccess(null);
		setDeactivating(true);
		try {
			await clearMobileSession();
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to clear device session',
			);
		} finally {
			setDeactivating(false);
		}
	};

	return (
		<Box className='field-more-page'>
			<Title order={2} mb='lg' style={{ fontFamily: 'var(--font-display)' }}>
				More
			</Title>
			<Text
				fz={11}
				tt='uppercase'
				fw={600}
				c='dimmed'
				mb={6}
				style={{ letterSpacing: '0.04em' }}
			>
				Signed in as
			</Text>
			{mobileSession ? (
				<Text mb='md' fw={500}>
					{mobileSession.displayName}
				</Text>
			) : (
				<UserSelect variant='light' />
			)}

			{isNative ? (
				<Stack mt='xl' gap='sm'>
					<Text
						fz={11}
						tt='uppercase'
						fw={600}
						c='dimmed'
						style={{ letterSpacing: '0.04em' }}
					>
						Device activation
					</Text>
					{error ? (
						<Alert color='red' title='Activation failed'>
							{error}
						</Alert>
					) : null}
					{success ? (
						<Alert color='green' title='Activated'>
							{success}
						</Alert>
					) : null}
					<Button
						leftSection={<QrCode size={18} />}
						onClick={() => void handleScanQr()}
						loading={scanning}
						color='brand'
						fullWidth
					>
						Scan new activation QR
					</Button>
					{mobileSession ? (
						<Button
							leftSection={<LogOut size={18} />}
							onClick={() => void handleDeactivate()}
							loading={deactivating}
							variant='light'
							color='red'
							fullWidth
						>
							Deactivate this device
						</Button>
					) : null}
					<Text size='sm' c='dimmed'>
						Scan a QR issued from the desktop Users page to re-authenticate this
						device. Deactivate clears the local session (same as a remote
						revoke).
					</Text>
				</Stack>
			) : null}
		</Box>
	);
}
