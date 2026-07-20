import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'app.field.mobile',
	appName: 'Field',
	webDir: 'dist',
	android: {
		// Allow http://10.0.2.2:3000 from the https Capacitor WebView (emulator → host API).
		allowMixedContent: true,
	},
	server: {
		cleartext: true,
	},
};

export default config;
