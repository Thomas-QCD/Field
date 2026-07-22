/**
 * Shared ADB helpers for unload / virtual / physical target scripts.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveAdb() {
	const sdk =
		process.env.ANDROID_HOME ||
		process.env.ANDROID_SDK_ROOT ||
		join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
	const fromSdk = join(
		sdk,
		"platform-tools",
		process.platform === "win32" ? "adb.exe" : "adb",
	);
	if (existsSync(fromSdk)) return fromSdk;
	return "adb";
}

export function adbRun(adb, args, { inherit = false } = {}) {
	const result = spawnSync(adb, args, {
		encoding: "utf8",
		stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
		shell: false,
	});
	return {
		ok: result.status === 0,
		status: result.status ?? 1,
		stdout: (result.stdout || "").trim(),
		stderr: (result.stderr || "").trim(),
	};
}

export function sleepSeconds(seconds) {
	spawnSync(
		process.platform === "win32" ? "timeout" : "sleep",
		process.platform === "win32"
			? ["/t", String(seconds), "/nobreak"]
			: [String(seconds)],
		{ stdio: "ignore", shell: true },
	);
}

export function listDevices(adb) {
	const { stdout, ok, stderr } = adbRun(adb, ["devices", "-l"]);
	if (!ok && !stdout) {
		return { lines: [], error: stderr || "adb devices failed" };
	}
	const lines = stdout
		.split(/\r?\n/)
		.slice(1)
		.map((l) => l.trim())
		.filter(Boolean);
	return { lines, error: null };
}

export function parseSerial(line) {
	return line.split(/\s+/)[0];
}

export function isEmulator(serial) {
	return serial.startsWith("emulator-");
}

/** Wireless debugging / TCP ADB (not USB serials). */
export function isWireless(serial) {
	return serial.includes("._adb-") || /:\d+$/.test(serial);
}

export function killEmulators(adb, serials) {
	const emulators = serials.filter(isEmulator);
	for (const serial of emulators) {
		console.log(`Stopping emulator ${serial}…`);
		const { ok, stderr } = adbRun(adb, ["-s", serial, "emu", "kill"]);
		if (!ok) {
			console.log(
				`  (emu kill: ${stderr || "failed — may already be quitting"})`,
			);
		}
	}
	return emulators.length;
}

export function disconnectWireless(adb) {
	console.log("Disconnecting wireless / TCP ADB sessions…");
	adbRun(adb, ["disconnect"]);
}

export function restartAdbServer(adb) {
	console.log("Restarting ADB server…");
	adbRun(adb, ["kill-server"]);
	sleepSeconds(1);
	const started = adbRun(adb, ["start-server"]);
	if (!started.ok && started.stderr) {
		console.error(started.stderr);
	}
}

export function printDeviceList(lines, label = "Attached") {
	if (lines.length === 0) {
		console.log(`${label}: (none)`);
		return;
	}
	console.log(`${label}:`);
	for (const line of lines) console.log(`  ${line}`);
}
