import { useState } from 'react';
import { Alert, Button, Center, Stack, Text, Title } from '@mantine/core';
import { QrCode } from 'lucide-react';
import { useCurrentUser } from '../context/CurrentUserContext';
import { activateFromQrScan } from './activateFromQr';

/** Native gate when no device session — same chrome as web LoginPage. */
export function MobileLoginPage() {
	const { refreshAfterMobileActivation } = useCurrentUser();
	const [scanning, setScanning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onScan = async () => {
		setError(null);
		setScanning(true);
		try {
			await activateFromQrScan();
			await refreshAfterMobileActivation();
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to scan activation QR',
			);
		} finally {
			setScanning(false);
		}
	};

	return (
		<Center
			mih='100dvh'
			px='md'
			style={{
				background:
					'radial-gradient(ellipse at 20% 0%, var(--color-accent-subtle) 0%, transparent 55%), linear-gradient(165deg, #f0f0f0 0%, #e4e4e4 45%, #ececec 100%)',
			}}
		>
			<Stack gap='lg' maw={400} w='100%' align='stretch'>
				<Stack gap={6}>
					<Title
						order={1}
						fz='2.75rem'
						fw={700}
						style={{
							fontFamily: 'var(--font-display)',
							letterSpacing: '-0.03em',
							color: 'var(--color-text)',
						}}
					>
						Field
					</Title>
					<Text c='dimmed' size='sm'>
						Scan your activation QR to sign in on this device.
					</Text>
				</Stack>
				{error ? (
					<Alert color='red' title='Sign in failed'>
						{error}
					</Alert>
				) : null}
				<Button
					size='md'
					color='brand'
					leftSection={<QrCode size={18} />}
					onClick={() => void onScan()}
					loading={scanning}
					disabled={scanning}
				>
					Scan activation QR
				</Button>
			</Stack>
		</Center>
	);
}
