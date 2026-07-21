import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Live reload: `npm run cap:live` sets CAP_LIVE_RELOAD + CAP_SERVER_URL so the
 * native WebView loads Vite instead of bundled dist/. Clear with `npm run cap:sync`.
 */
const liveReload =
	process.env.CAP_LIVE_RELOAD === '1' || process.env.CAP_LIVE_RELOAD === 'true';
const serverUrl = liveReload
	? (process.env.CAP_SERVER_URL ?? 'http://10.0.2.2:5173')
	: undefined;

const config: CapacitorConfig = {
	appId: 'app.field.mobile',
	appName: 'Field',
	webDir: 'dist',
	android: {
		// Allow http://10.0.2.2:3000 from the https Capacitor WebView (emulator → host API).
		allowMixedContent: true,
		webContentsDebuggingEnabled: true,
		// targetSdk 35 enforces edge-to-edge; inset the WebView so UI clears status + nav bars.
		adjustMarginsForEdgeToEdge: 'auto',
	},
	server: {
		cleartext: true,
		...(serverUrl ? { url: serverUrl } : {}),
	},
	plugins: {
		Keyboard: {
			// Keep WebView size stable; KeyboardAwareModal positions dialogs above the keyboard.
			resize: 'none',
		},
	},
};

export default config;
