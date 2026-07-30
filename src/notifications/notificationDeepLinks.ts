import type { PluginListenerHandle } from '@capacitor/core';

/** Payload stored on local (and later remote) notifications. */
export type FieldNotificationExtra = {
	notificationId: string;
	taskId?: number;
	/** Local calendar day YYYY-MM-DD (window start). */
	day?: string;
};

const TASK_VIEW_IDS = new Set([
	'task_assigned',
	'schedule_changed',
	'task_details_changed',
]);

const MY_TASKS_DAY_IDS = new Set(['task_unassigned', 'task_cancelled']);

/** Resolve in-app path for a notification tap. */
export function pathForNotification(
	extra: FieldNotificationExtra,
): string | null {
	const id = extra.notificationId;
	if (TASK_VIEW_IDS.has(id)) {
		if (extra.taskId == null || !Number.isFinite(extra.taskId)) return null;
		return `/task/${extra.taskId}`;
	}
	if (MY_TASKS_DAY_IDS.has(id)) {
		if (extra.day && /^\d{4}-\d{2}-\d{2}$/.test(extra.day)) {
			return `/my-tasks?day=${encodeURIComponent(extra.day)}`;
		}
		return '/my-tasks';
	}
	return null;
}

function readExtra(raw: unknown): FieldNotificationExtra | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const notificationId = o.notificationId;
	if (typeof notificationId !== 'string' || !notificationId) return null;
	const taskIdRaw = o.taskId;
	const taskId =
		typeof taskIdRaw === 'number'
			? taskIdRaw
			: typeof taskIdRaw === 'string' && taskIdRaw.trim() !== ''
				? Number(taskIdRaw)
				: undefined;
	const day = typeof o.day === 'string' ? o.day : undefined;
	return {
		notificationId,
		taskId: taskId != null && Number.isFinite(taskId) ? taskId : undefined,
		day,
	};
}

/**
 * Listen for local-notification taps and navigate. Call once under
 * BrowserRouter. Returns a cleanup that removes the listener.
 */
export async function initNotificationTapHandler(
	navigate: (path: string) => void,
): Promise<() => void> {
	const { Capacitor } = await import('@capacitor/core');
	if (!Capacitor.isNativePlatform()) return () => {};

	const { LocalNotifications } = await import('@capacitor/local-notifications');

	const handleTap = (extraRaw: unknown) => {
		const extra = readExtra(extraRaw);
		if (!extra) return;
		const path = pathForNotification(extra);
		if (path) navigate(path);
	};

	const performed: PluginListenerHandle =
		await LocalNotifications.addListener(
			'localNotificationActionPerformed',
			(event) => {
				handleTap(event.notification.extra);
			},
		);

	return () => {
		void performed.remove();
	};
}
