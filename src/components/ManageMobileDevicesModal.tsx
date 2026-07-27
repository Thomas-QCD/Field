import { useCallback, useEffect, useState } from 'react';
import {
	Alert,
	Button,
	Center,
	Group,
	Loader,
	Stack,
	Text,
} from '@mantine/core';
import {
	listMobileDevices,
	revokeAllMobileDevices,
	revokeMobileDevice,
	type AppUser,
	type MobileDevice,
} from '../api/users';
import { useCurrentUser } from '../context/CurrentUserContext';
import { KeyboardAwareModal } from './KeyboardAwareModal';

type ManageMobileDevicesModalProps = {
	user: AppUser | null;
	opened: boolean;
	onClose: () => void;
};

function formatWhen(iso: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

export function ManageMobileDevicesModal({
	user,
	opened,
	onClose,
}: ManageMobileDevicesModalProps) {
	const { user: currentUser, entraMode } = useCurrentUser();
	const [loading, setLoading] = useState(false);
	const [acting, setActing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [devices, setDevices] = useState<MobileDevice[]>([]);

	const actorOpts = useCallback(() => {
		if (entraMode) return {};
		return { actorUserId: currentUser?.id, revokedByUserId: currentUser?.id };
	}, [entraMode, currentUser?.id]);

	const refresh = useCallback(
		async (signal?: AbortSignal) => {
			if (!user) return;
			setLoading(true);
			setError(null);
			try {
				const next = await listMobileDevices(user.id, {
					...actorOpts(),
					signal,
				});
				if (!signal?.aborted) setDevices(next);
			} catch (err: unknown) {
				if (
					(err instanceof DOMException || err instanceof Error) &&
					err.name === 'AbortError'
				) {
					return;
				}
				setError(
					err instanceof Error ? err.message : 'Failed to load devices',
				);
			} finally {
				if (!signal?.aborted) setLoading(false);
			}
		},
		[user, actorOpts],
	);

	useEffect(() => {
		if (!opened || !user) {
			setDevices([]);
			setError(null);
			setLoading(false);
			setActing(false);
			return;
		}
		const controller = new AbortController();
		void refresh(controller.signal);
		return () => controller.abort();
	}, [opened, user, refresh]);

	async function handleRevokeOne(device: MobileDevice) {
		if (!user) return;
		const label = device.deviceLabel?.trim() || 'this device';
		if (!window.confirm(`Revoke mobile session for ${label}?`)) return;
		setActing(true);
		setError(null);
		try {
			await revokeMobileDevice(user.id, device.id, actorOpts());
			await refresh();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to revoke device');
		} finally {
			setActing(false);
		}
	}

	async function handleRevokeAll() {
		if (!user || devices.length === 0) return;
		if (
			!window.confirm(
				`Revoke all ${devices.length} mobile session${devices.length === 1 ? '' : 's'} for ${user.displayName}?`,
			)
		) {
			return;
		}
		setActing(true);
		setError(null);
		try {
			await revokeAllMobileDevices(user.id, actorOpts());
			await refresh();
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to revoke sessions',
			);
		} finally {
			setActing(false);
		}
	}

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={onClose}
			title={user ? `Devices — ${user.displayName}` : 'Devices'}
			centered
		>
			{loading ? (
				<Center py='xl'>
					<Loader size='sm' />
				</Center>
			) : null}

			{error ? (
				<Alert color='red' title='Could not manage devices' mb='md'>
					{error}
				</Alert>
			) : null}

			{!loading && devices.length === 0 ? (
				<Text size='sm' c='dimmed' ta='center' py='md'>
					No active mobile sessions for this user.
				</Text>
			) : null}

			{!loading && devices.length > 0 ? (
				<Stack gap='sm'>
					<Text size='sm' c='dimmed'>
						Revoking ends access on that phone. The next API call clears the
						local session and returns to QR activation.
					</Text>
					{devices.map((device) => (
						<Group
							key={device.id}
							justify='space-between'
							align='flex-start'
							wrap='nowrap'
							gap='sm'
						>
							<Stack gap={2} style={{ minWidth: 0 }}>
								<Text size='sm' fw={500} truncate>
									{device.deviceLabel?.trim() || 'Mobile device'}
								</Text>
								<Text size='xs' c='dimmed'>
									Activated {formatWhen(device.activatedAt)}
								</Text>
								<Text size='xs' c='dimmed'>
									Last seen {formatWhen(device.lastSeenAt)}
								</Text>
							</Stack>
							<Button
								size='compact-xs'
								variant='light'
								color='red'
								disabled={acting}
								onClick={() => void handleRevokeOne(device)}
							>
								Revoke
							</Button>
						</Group>
					))}
					<Button
						variant='outline'
						color='red'
						fullWidth
						mt='xs'
						disabled={acting}
						onClick={() => void handleRevokeAll()}
					>
						Revoke all sessions
					</Button>
				</Stack>
			) : null}

			{!loading ? (
				<Button onClick={onClose} color='brand' fullWidth mt='md' variant='default'>
					Close
				</Button>
			) : null}
		</KeyboardAwareModal>
	);
}
