import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Live reload: `npm run cap:live` sets CAP_LIVE_RELOAD + CAP_SERVER_URL so the
 * native WebView loads Vite instead of bundled dist/. Clear with `npm run cap:sync`.
 *
 * Release / staging sideload: `FIELD_CAP_RELEASE=1` (set by `npm run apk:staging`)
 * turns off cleartext, mixed content, and WebView debugging.
 */
const liveReload =
	process.env.CAP_LIVE_RELOAD === '1' || process.env.CAP_LIVE_RELOAD === 'true';
const isRelease =
	process.env.FIELD_CAP_RELEASE === '1' ||
	process.env.FIELD_CAP_RELEASE === 'true';
const serverUrl = liveReload
	? (process.env.CAP_SERVER_URL ?? 'http://10.0.2.2:5173')
	: undefined;

const config: CapacitorConfig = {
	appId: 'app.field.mobile',
	appName: 'Field',
	webDir: 'dist',
	android: {
		// Dev: allow http://10.0.2.2:3000 from the https Capacitor WebView.
		allowMixedContent: !isRelease,
		webContentsDebuggingEnabled: !isRelease,
		// targetSdk 35 enforces edge-to-edge; inset the WebView so UI clears status + nav bars.
		adjustMarginsForEdgeToEdge: 'auto',
	},
	server: {
		cleartext: !isRelease,
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
