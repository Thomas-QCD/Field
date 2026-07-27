/**
 * Build a standard bundled Android debug APK (no live-reload URL)
 * and serve it over LAN for sideload download.
 *
 * Usage: npm run apk:serve
 * Output: dist-apk/field.apk
 * Download: http://<lan-ip>:8765/field.apk
 *
 * Env:
 *   APK_SERVE_PORT — listen port (default 8765)
 *   APK_SERVE_SKIP_BUILD=1 — serve existing dist-apk/field.apk only
 */
import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	createReadStream,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const apkOutDir = path.join(root, 'dist-apk');
const apkSrc = path.join(
	androidDir,
	'app',
	'build',
	'outputs',
	'apk',
	'debug',
	'app-debug.apk',
);
const apkName = 'field.apk';
const apkDest = path.join(apkOutDir, apkName);
const isWin = process.platform === 'win32';
const gradle = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
const port = Number(process.env.APK_SERVE_PORT || 8765);
const skipBuild = process.env.APK_SERVE_SKIP_BUILD === '1';

/** Capacitor 7 Android build needs JDK 21; prefer Android Studio JBR when present. */
function resolveJavaHome() {
	const candidates = [
		process.env.JAVA_HOME_21,
		'C:\\Program Files\\Android\\Android Studio\\jbr',
		path.join(
			process.env.LOCALAPPDATA ?? '',
			'Programs',
			'Android',
			'Android Studio',
			'jbr',
		),
		process.env.JAVA_HOME,
	].filter(Boolean);

	for (const candidate of candidates) {
		const javaBin = path.join(candidate, 'bin', isWin ? 'java.exe' : 'java');
		if (existsSync(javaBin)) return candidate;
	}
	return process.env.JAVA_HOME;
}

function run(command, args, opts = {}) {
	console.log(`\n> ${command} ${args.join(' ')}`);
	const result = spawnSync(command, args, {
		cwd: opts.cwd ?? root,
		env: { ...process.env, ...opts.env },
		stdio: 'inherit',
		shell: isWin,
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function lanAddresses() {
	const nets = os.networkInterfaces();
	const out = [];
	for (const entries of Object.values(nets)) {
		if (!entries) continue;
		for (const entry of entries) {
			if (entry.family !== 'IPv4' || entry.internal) continue;
			out.push(entry.address);
		}
	}
	return out;
}

function buildApk() {
	// Ensure no live-reload URL is baked into Capacitor config.
	delete process.env.CAP_LIVE_RELOAD;
	delete process.env.CAP_SERVER_URL;

	console.log('Building web assets…');
	run(isWin ? 'npm.cmd' : 'npm', ['run', 'build']);

	console.log('\nSyncing Capacitor (no live reload)…');
	run(isWin ? 'npx.cmd' : 'npx', ['cap', 'sync'], {
		env: {
			CAP_LIVE_RELOAD: '',
			CAP_SERVER_URL: '',
		},
	});

	const capConfigPath = path.join(
		androidDir,
		'app',
		'src',
		'main',
		'assets',
		'capacitor.config.json',
	);
	if (!existsSync(capConfigPath)) {
		console.error(`Missing ${capConfigPath}`);
		process.exit(1);
	}
	const capConfig = JSON.parse(readFileSync(capConfigPath, 'utf8'));
	if (capConfig?.server?.url) {
		console.error(
			'ERROR: capacitor.config.json still has server.url — refuse to ship a live-reload APK.',
		);
		console.error(`  server.url = ${capConfig.server.url}`);
		process.exit(1);
	}
	console.log('Verified: Capacitor config has no server.url (bundled assets).');

	if (!existsSync(gradle)) {
		console.error(`Gradle wrapper not found at ${gradle}`);
		process.exit(1);
	}

	const javaHome = resolveJavaHome();
	if (javaHome) {
		console.log(`\nUsing JAVA_HOME=${javaHome}`);
	} else {
		console.warn('\nWARNING: JAVA_HOME not set; Gradle may fail without JDK 21.');
	}

	console.log('\nAssembling debug APK…');
	run(gradle, ['assembleDebug'], {
		cwd: androidDir,
		env: javaHome ? { JAVA_HOME: javaHome } : {},
	});

	if (!existsSync(apkSrc)) {
		console.error(`APK not found at ${apkSrc}`);
		process.exit(1);
	}

	mkdirSync(apkOutDir, { recursive: true });
	if (existsSync(apkDest)) rmSync(apkDest);
	copyFileSync(apkSrc, apkDest);
	console.log(`\nAPK ready:\n  ${apkDest}`);
}

function contentType(filePath) {
	if (filePath.endsWith('.apk')) return 'application/vnd.android.package-archive';
	if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
	return 'application/octet-stream';
}

function serveApk() {
	if (!existsSync(apkDest)) {
		console.error(`Missing ${apkDest}. Run without APK_SERVE_SKIP_BUILD.`);
		process.exit(1);
	}

	const server = http.createServer((req, res) => {
		const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
		if (urlPath === '/' || urlPath === '/index.html') {
			const sizeMb = (statSync(apkDest).size / (1024 * 1024)).toFixed(1);
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Field APK</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.45}
  a{display:inline-block;margin-top:1rem;padding:.75rem 1.1rem;background:#732e75;color:#fff;text-decoration:none;border-radius:.5rem;font-weight:600}
</style></head><body>
<h1>Field</h1>
<p>Standard debug APK (${sizeMb} MB). On Android, open the link and allow install from this browser if prompted.</p>
<p><a href="/${apkName}">Download ${apkName}</a></p>
</body></html>`);
			return;
		}

		if (urlPath === `/${apkName}`) {
			const { size } = statSync(apkDest);
			res.writeHead(200, {
				'Content-Type': contentType(apkDest),
				'Content-Length': size,
				'Content-Disposition': `attachment; filename="${apkName}"`,
			});
			createReadStream(apkDest).pipe(res);
			return;
		}

		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Not found');
	});

	server.listen(port, '0.0.0.0', () => {
		const addrs = lanAddresses();
		console.log(`\nServing ${apkName} on port ${port}`);
		console.log('Open on your phone (same Wi‑Fi):');
		if (addrs.length === 0) {
			console.log(`  http://<your-lan-ip>:${port}/${apkName}`);
		} else {
			for (const ip of addrs) {
				console.log(`  http://${ip}:${port}/${apkName}`);
			}
		}
		console.log('\nPress Ctrl+C to stop.\n');
	});
}

if (!skipBuild) {
	buildApk();
} else {
	console.log('Skipping build (APK_SERVE_SKIP_BUILD=1).');
}
serveApk();
