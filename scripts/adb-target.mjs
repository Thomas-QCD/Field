/**
 * Switch Android test target: clear the other side, point Capacitor live
 * reload at the right host, leave you ready to Run Field.
 *
 * Usage:
 *   npm run adb:virtual    # emulator → http://10.0.2.2:5173
 *   npm run adb:physical   # phone → http://<LAN-IP>:5173
 *
 * Keep `npm run dev` running. After this script, Run Field from Android Studio
 * on the chosen device, then refresh chrome://inspect.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
	resolveAdb,
	listDevices,
	parseSerial,
	isEmulator,
	isWireless,
	killEmulators,
	disconnectWireless,
	restartAdbServer,
	sleepSeconds,
	printDeviceList,
} from "./adb-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2]; // "virtual" | "physical"

if (mode !== "virtual" && mode !== "physical") {
	console.error("Usage: node scripts/adb-target.mjs <virtual|physical>");
	process.exit(1);
}

const adb = resolveAdb();
console.log(`Using adb: ${adb}`);
console.log(
	mode === "virtual"
		? "Target: Android emulator (virtual)"
		: "Target: physical Android device",
);

const before = listDevices(adb);
if (before.error) {
	console.error(before.error);
	process.exit(1);
}
printDeviceList(before.lines, "Before");
const serials = before.lines.map(parseSerial);

if (mode === "virtual") {
	// Drop phone sessions so Inspect / ADB aren't split across two targets.
	const physical = serials.filter((s) => !isEmulator(s));
	if (physical.length > 0) {
		disconnectWireless(adb);
		restartAdbServer(adb);
		// mDNS can reattach wireless debugging — disconnect again.
		disconnectWireless(adb);
		const usbStill = listDevices(adb).lines.some((l) => {
			const s = parseSerial(l);
			return !isEmulator(s) && !isWireless(s);
		});
		if (usbStill) {
			console.log(
				"\nUSB phone still listed — unplug it (or turn off USB debugging) so only the emulator remains.",
			);
		}
		const wirelessStill = listDevices(adb).lines.some((l) =>
			isWireless(parseSerial(l)),
		);
		if (wirelessStill) {
			console.log(
				"\nWireless phone came back — turn OFF Wireless debugging on the phone, then re-run npm run adb:virtual.",
			);
		}
	} else {
		console.log("No physical ADB sessions to clear.");
	}
} else {
	// Physical: quit emulators so only the phone is the active target.
	const killed = killEmulators(adb, serials);
	if (killed > 0) {
		sleepSeconds(1);
		restartAdbServer(adb);
	} else {
		console.log("No emulators running.");
	}
}

console.log("");
const capArgs =
	mode === "physical"
		? ["scripts/cap-live.mjs", "device"]
		: ["scripts/cap-live.mjs"];
const cap = spawnSync(process.execPath, capArgs, {
	cwd: root,
	stdio: "inherit",
	env: process.env,
});
if ((cap.status ?? 1) !== 0) {
	process.exit(cap.status ?? 1);
}

sleepSeconds(1);
const after = listDevices(adb);
printDeviceList(after.lines, "\nADB now");

const online = after.lines.filter((l) => /\sdevice\b/.test(l));
const emus = online.filter((l) => isEmulator(parseSerial(l)));
const phones = online.filter((l) => !isEmulator(parseSerial(l)));

console.log("");
if (mode === "virtual") {
	if (emus.length === 0) {
		console.log("No emulator online yet. Start an AVD in Android Studio Device Manager.");
	} else {
		console.log("Emulator is online.");
	}
	console.log("Next: keep `npm run dev` running → Run Field on the emulator → chrome://inspect → Refresh");
	if (phones.length > 0) {
		console.log(
			"Warning: a physical device is still attached — unload it if Inspect picks the wrong target.",
		);
	}
} else {
	if (phones.length === 0) {
		console.log(
			"No phone online yet. Plug in USB or enable Wireless debugging and pair, then check `adb devices`.",
		);
	} else {
		console.log("Phone is online.");
	}
	console.log(
		"Next: keep `npm run dev` running → Run Field on the phone → chrome://inspect → Refresh",
	);
	if (emus.length > 0) {
		console.log(
			"Warning: an emulator is still listed — close it if Inspect picks the wrong target.",
		);
	}
}
