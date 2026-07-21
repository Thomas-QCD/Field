/**
 * Point the native shell at the Vite dev server for hot reload.
 *
 * Usage:
 *   npm run cap:live              # Android emulator → http://10.0.2.2:5173
 *   npm run cap:live -- ios       # iOS Simulator → http://127.0.0.1:5173 (sync ios only)
 *   npm run cap:live -- device    # Physical device → http://<LAN-IP>:5173
 *   CAP_SERVER_URL=http://192.168.1.10:5173 npm run cap:live -- ios
 *
 * Keep `npm run dev` running, then Run from Android Studio / Xcode.
 * To return to bundled assets: `npm run cap:sync`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function lanIPv4() {
	const nets = networkInterfaces();
	for (const entries of Object.values(nets)) {
		if (!entries) continue;
		for (const net of entries) {
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	return null;
}

const mode = process.argv[2]; // "ios" | "android" | "device" | undefined
const platform =
	mode === "ios" || mode === "android" ? mode : undefined;

process.env.CAP_LIVE_RELOAD = "1";

if (!process.env.CAP_SERVER_URL) {
	if (mode === "ios") {
		// iOS Simulator can reach the Mac host on loopback.
		process.env.CAP_SERVER_URL = "http://127.0.0.1:5173";
	} else if (mode === "device") {
		const ip = lanIPv4();
		if (!ip) {
			console.error(
				"No LAN IPv4 found. Set CAP_SERVER_URL=http://<your-pc-ip>:5173 and retry.",
			);
			process.exit(1);
		}
		process.env.CAP_SERVER_URL = `http://${ip}:5173`;
	} else {
		// Android emulator loopback to host machine.
		process.env.CAP_SERVER_URL = "http://10.0.2.2:5173";
	}
}

const runHint =
	platform === "ios"
		? "Keep `npm run dev` running, then Run from Xcode."
		: platform === "android"
			? "Keep `npm run dev` running, then Run from Android Studio."
			: "Keep `npm run dev` running, then Run from Android Studio / Xcode.";

console.log(`Capacitor live reload → ${process.env.CAP_SERVER_URL}`);
console.log(runHint);

// Fresh clones may lack android/.../assets (generated files are gitignored).
// Capacitor fails writing capacitor.config.json if the directory is missing.
mkdirSync(resolve(root, "android/app/src/main/assets"), { recursive: true });

const syncArgs = platform ? ["cap", "sync", platform] : ["cap", "sync"];
const result = spawnSync("npx", syncArgs, {
	cwd: root,
	stdio: "inherit",
	shell: true,
	env: process.env,
});

process.exit(result.status ?? 1);
