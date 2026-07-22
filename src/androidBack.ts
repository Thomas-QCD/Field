/**
 * LIFO stack for Android system back. UI that shows a Back/Close control
 * registers while active; the top handler runs instead of exiting the app.
 */

type AndroidBackHandler = () => void;

const handlers: AndroidBackHandler[] = [];
let listenerStarted = false;

export function registerAndroidBackHandler(handler: AndroidBackHandler): () => void {
	handlers.push(handler);
	return () => {
		const idx = handlers.lastIndexOf(handler);
		if (idx !== -1) handlers.splice(idx, 1);
	};
}

function dispatchAndroidBack(): boolean {
	const handler = handlers[handlers.length - 1];
	if (!handler) return false;
	handler();
	return true;
}

/** Listen for Capacitor `backButton` once (native only). */
export async function initAndroidBackButton(): Promise<void> {
	if (listenerStarted) return;
	listenerStarted = true;

	const { Capacitor } = await import('@capacitor/core');
	if (!Capacitor.isNativePlatform()) return;

	const { App } = await import('@capacitor/app');
	await App.addListener('backButton', ({ canGoBack }) => {
		if (dispatchAndroidBack()) return;
		if (canGoBack) {
			window.history.back();
			return;
		}
		void App.exitApp();
	});
}
