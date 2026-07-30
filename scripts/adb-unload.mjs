/**
 * Clear ADB of whatever you're testing on (emulator and/or physical)
 * so you can attach a different device cleanly.
 *
 * Usage: node scripts/adb-unload.mjs
 *
 * Prefer `npm run adb:virtual` / `npm run adb:physical` when switching
 * targets — those also point Capacitor live reload at the right host.
 */
import {
	resolveAdb,
	listDevices,
	parseSerial,
	isEmulator,
	isWireless,
	killEmulators,
	disconnectWireless,
	restartAdbServer,
	adbRun,
	printDeviceList,
} from "./adb-lib.mjs";

const adb = resolveAdb();
console.log(`Using adb: ${adb}`);

const before = listDevices(adb);
if (before.error) {
	console.error(before.error);
	process.exit(1);
}

if (before.lines.length === 0) {
	console.log("No ADB devices attached — already clear.");
} else {
	printDeviceList(before.lines);
}

const serials = before.lines.map(parseSerial);
killEmulators(adb, serials);

if (serials.length > 0) {
	disconnectWireless(adb);
}

restartAdbServer(adb);
// mDNS wireless debugging can reappear immediately if still enabled on the phone.
adbRun(adb, ["disconnect"]);

const after = listDevices(adb);
const remaining = after.lines;

if (remaining.length === 0) {
	console.log("\nADB is clear. Next:");
	console.log("  • Emulator: npm run adb:virtual");
	console.log("  • Physical: npm run adb:physical");
	console.log("  • Inspect: chrome://inspect → Refresh");
	process.exit(0);
}

printDeviceList(remaining, "Still listed after unload");

const usbLeft = remaining.some((l) => {
	const s = parseSerial(l);
	return !isEmulator(s) && !isWireless(s);
});
const wirelessLeft = remaining.some((l) => isWireless(parseSerial(l)));
const emuLeft = remaining.some((l) => isEmulator(parseSerial(l)));

if (usbLeft) {
	console.log(
		"\nUSB device still present — unplug the cable (or revoke USB debugging) to fully clear it.",
	);
}
if (wirelessLeft) {
	console.log(
		"\nWireless target came back — turn OFF Wireless debugging on the phone, then re-run node scripts/adb-unload.mjs.",
	);
}
if (emuLeft) {
	console.log(
		"\nEmulator still listed — close it in Android Studio Device Manager if it did not quit.",
	);
}

process.exit(1);
