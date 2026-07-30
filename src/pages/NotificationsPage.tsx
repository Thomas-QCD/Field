import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert, Box, Button, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { FieldNotificationExtra } from '../notifications/notificationDeepLinks';

const CHANNEL_ID = 'field_test';
const DEFAULT_DELAY_MS = 1000;

/** Shared sample payload for tap-handler tests (matches button copy). */
const TEST_TASK_ID = 99440;
const TEST_DAY = '2026-07-29';

const TEST_NOTIFICATIONS = [
	{
		id: 'task_assigned',
		title: 'Assigned to task #99440 - 7/29',
		body: '7/29 10am @ COSMO - Cosmopolitan',
	},
	{
		id: 'task_unassigned',
		title: 'Removed from task #99440 - 7/29',
		body: 'Removed from task @ COSMO - Cosmopolitan',
	},
	{
		id: 'task_cancelled',
		title: 'Task cancelled #99440 - 7/29',
		body: 'Task cancelled @ COSMO - Cosmopolitan',
	},
	{
		id: 'schedule_changed',
		title: 'Schedule changed #99440 - 7/29',
		body: 'Window Start 1:10am 7/29 -> 1:30am 7/29',
	},
	{
		id: 'task_details_changed',
		title: 'Task details changed #99440 - 7/29',
		body: 'Anthony H. removed from task',
	},
] as const;

let nextId = Math.floor(Date.now() % 100_000);

function allocId(): number {
	nextId += 1;
	return nextId;
}

/** Mobile-only page with buttons that fire local notifications for testing. */
export function NotificationsPage() {
	const isDesktop = useMediaQuery('(min-width: 48em)');
	const isNative = Capacitor.isNativePlatform();
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isNative) return;

		let cancelled = false;

		const setup = async () => {
			try {
				const perm = await LocalNotifications.requestPermissions();
				if (cancelled) return;
				if (perm.display !== 'granted') {
					setError('Notification permission denied');
					return;
				}

				if (Capacitor.getPlatform() === 'android') {
					await LocalNotifications.createChannel({
						id: CHANNEL_ID,
						name: 'Field test',
						description: 'Test notifications',
						importance: 5,
						visibility: 1,
					});
				}

				if (!cancelled) {
					setReady(true);
					setStatus('Ready — permission granted');
				}
			} catch (err: unknown) {
				if (!cancelled) {
					setError(
						err instanceof Error
							? err.message
							: 'Failed to set up notifications',
					);
				}
			}
		};

		void setup();
		return () => {
			cancelled = true;
		};
	}, [isNative]);

	if (isDesktop) {
		return <Navigate to='/' replace />;
	}

	const fire = async (opts: { id: string; title: string; body: string }) => {
		setError(null);
		setStatus(null);
		setBusy(true);
		try {
			const extra: FieldNotificationExtra = {
				notificationId: opts.id,
				taskId: TEST_TASK_ID,
				day: TEST_DAY,
			};
			const notification: {
				id: number;
				title: string;
				body: string;
				schedule: { at: Date };
				extra: FieldNotificationExtra;
				channelId?: string;
			} = {
				id: allocId(),
				title: opts.title,
				body: opts.body,
				schedule: { at: new Date(Date.now() + DEFAULT_DELAY_MS) },
				extra,
			};
			if (Capacitor.getPlatform() === 'android') {
				notification.channelId = CHANNEL_ID;
			}

			await LocalNotifications.schedule({
				notifications: [notification],
			});

			setStatus(`${opts.id} scheduled in ${DEFAULT_DELAY_MS / 1000}s`);
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : 'Failed to schedule notification',
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Box className='field-notifications-page'>
			<Title order={2} mb='lg' style={{ fontFamily: 'var(--font-display)' }}>
				Notifications
			</Title>

			{!isNative ? (
				<Text c='dimmed' size='sm'>
					Local notifications only work in the native Capacitor app (iOS /
					Android).
				</Text>
			) : (
				<Stack gap='sm'>
					{error ? (
						<Alert color='red' title='Error'>
							{error}
						</Alert>
					) : null}
					{status ? (
						<Alert color='green' title='Status'>
							{status}
						</Alert>
					) : null}
					<Text size='sm' c='dimmed'>
						Each button fires a test notification after 1s (task #
						{TEST_TASK_ID}, {TEST_DAY}). Tap the banner to open the related
						screen.
					</Text>
					{TEST_NOTIFICATIONS.map((n, i) => (
						<Button
							key={n.id}
							color='brand'
							variant={i === 0 ? 'filled' : 'light'}
							fullWidth
							disabled={!ready || busy}
							loading={busy}
							onClick={() => void fire(n)}
						>
							{n.id}
						</Button>
					))}
				</Stack>
			)}
		</Box>
	);
}
