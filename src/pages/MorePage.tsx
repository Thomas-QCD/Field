import { useState } from 'react';
import { Navigate, NavLink as RouterNavLink } from 'react-router-dom';
import {
	Alert,
	Box,
	Button,
	NavLink,
	Stack,
	Text,
	TextInput,
	Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Capacitor } from '@capacitor/core';
import { ChevronRight, LogOut, MapPinned, QrCode } from 'lucide-react';
import {
	activateFromQrScan,
	activateWithCode,
	canScanActivationQr,
} from '../auth/activateFromQr';
import { clearMobileSession } from '../auth/mobileSession';
import { UserSelect } from '../components/UserSelect';
import { useCurrentUser } from '../context/CurrentUserContext';

/** Mobile-only settings/account surface (user select, QR re-activate, etc.). */
export function MorePage() {
	const isDesktop = useMediaQuery('(min-width: 48em)');
	const isNative = Capacitor.isNativePlatform();
	const { mobileSession, refreshAfterMobileActivation } = useCurrentUser();
	const [code, setCode] = useState('');
	const [busy, setBusy] = useState(false);
	const [deactivating, setDeactivating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const showScan = canScanActivationQr();

	if (isDesktop) {
		return <Navigate to='/' replace />;
	}

	const finishActivate = async (fn: () => Promise<{ displayName: string }>) => {
		setError(null);
		setSuccess(null);
		setBusy(true);
		try {
			const { displayName } = await fn();
			await refreshAfterMobileActivation();
			setSuccess(`Signed in as ${displayName}`);
			setCode('');
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to activate device',
			);
		} finally {
			setBusy(false);
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

			<Stack mt='xl' gap={4}>
				<Text
					fz={11}
					tt='uppercase'
					fw={600}
					c='dimmed'
					mb={2}
					style={{ letterSpacing: '0.04em' }}
				>
					Pages
				</Text>
				<NavLink
					component={RouterNavLink}
					to='/addresses'
					label='Addresses'
					leftSection={<MapPinned size={18} />}
					rightSection={<ChevronRight size={16} />}
					color='brand'
					styles={{
						root: { borderRadius: 'var(--mantine-radius-md)' },
						label: { fontWeight: 500 },
					}}
				/>
			</Stack>

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
					<TextInput
						label='Activation code'
						placeholder='field1.…'
						value={code}
						onChange={(e) => setCode(e.currentTarget.value)}
						disabled={busy}
						autoCapitalize='off'
						autoCorrect='off'
						spellCheck={false}
					/>
					<Button
						onClick={() => void finishActivate(() => activateWithCode(code))}
						loading={busy}
						disabled={busy || !code.trim()}
						color='brand'
						fullWidth
					>
						Activate with code
					</Button>
					{showScan ? (
						<Button
							leftSection={<QrCode size={18} />}
							onClick={() =>
								void finishActivate(() => activateFromQrScan())
							}
							loading={busy}
							disabled={busy}
							variant='light'
							color='brand'
							fullWidth
						>
							Scan new activation QR
						</Button>
					) : null}
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
						Paste a field1.… code from the desktop Users page (or scan on
						Android). Deactivate clears the local session (same as a remote
						revoke).
					</Text>
				</Stack>
			) : null}
		</Box>
	);
}
