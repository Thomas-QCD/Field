import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initNotificationTapHandler } from './notificationDeepLinks';

/** Registers Capacitor local-notification tap → in-app navigation. */
export function NotificationTapListener() {
	const navigate = useNavigate();

	useEffect(() => {
		let remove: (() => void) | undefined;
		let cancelled = false;

		void initNotificationTapHandler((path) => {
			navigate(path);
		}).then((cleanup) => {
			if (cancelled) {
				cleanup();
				return;
			}
			remove = cleanup;
		});

		return () => {
			cancelled = true;
			remove?.();
		};
	}, [navigate]);

	return null;
}
