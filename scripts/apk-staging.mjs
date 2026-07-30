/**
 * Signed release APK pointed at staging CloudFront, for private sideload.
 *
 * Prerequisites:
 *   npm run android:keystore   # once
 *
 * Usage:
 *   npm run apk:staging
 *   npm run apk:staging -- --serve
 *
 * Output: dist-apk/field-staging.apk
 *
 * Env:
 *   APK_SERVE_PORT — listen port when --serve (default 8765)
 *   FIELD_VERSION_CODE / FIELD_VERSION_NAME — optional APK version overrides
 *   APK_STAGING_SKIP_SYNC=1 — skip cap:staging; assemble only (already synced)
 *   APK_STAGING_SKIP_BUILD=1 — serve existing dist-apk/field-staging.apk only
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const propsPath = path.join(androidDir, "keystore.properties");
const apkOutDir = path.join(root, "dist-apk");
const apkSrc = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
const apkName = "field-staging.apk";
const apkDest = path.join(apkOutDir, apkName);
const isWin = process.platform === "win32";
const gradle = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");
const port = Number(process.env.APK_SERVE_PORT || 8765);
const skipSync = process.env.APK_STAGING_SKIP_SYNC === "1";
const skipBuild = process.env.APK_STAGING_SKIP_BUILD === "1";
const serve = process.argv.includes("--serve");

function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME_21,
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Programs",
      "Android",
      "Android Studio",
      "jbr",
    ),
    process.env.JAVA_HOME,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const javaBin = path.join(candidate, "bin", isWin ? "java.exe" : "java");
    if (existsSync(javaBin)) return candidate;
  }
  return process.env.JAVA_HOME;
}

function run(command, args, opts = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
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
      if (entry.family !== "IPv4" || entry.internal) continue;
      out.push(entry.address);
    }
  }
  return out;
}

function assertReleaseSigning() {
  if (!existsSync(propsPath)) {
    console.error(`Missing ${propsPath}`);
    console.error("Create a release keystore first:");
    console.error("  FIELD_KEYSTORE_PASSWORD='…' npm run android:keystore");
    process.exit(1);
  }
}

function assertNoLiveReload() {
  const capConfigPath = path.join(
    androidDir,
    "app",
    "src",
    "main",
    "assets",
    "capacitor.config.json",
  );
  if (!existsSync(capConfigPath)) {
    console.error(`Missing ${capConfigPath} — run sync first.`);
    process.exit(1);
  }
  const capConfig = JSON.parse(readFileSync(capConfigPath, "utf8"));
  if (capConfig?.server?.url) {
    console.error(
      "ERROR: capacitor.config.json still has server.url — refuse to ship a live-reload APK.",
    );
    console.error(`  server.url = ${capConfig.server.url}`);
    process.exit(1);
  }
  if (capConfig?.android?.webContentsDebuggingEnabled) {
    console.error(
      "ERROR: webContentsDebuggingEnabled is true — re-run with release Cap flags (apk:staging sets FIELD_CAP_RELEASE=1).",
    );
    process.exit(1);
  }
  if (capConfig?.server?.cleartext) {
    console.error(
      "ERROR: server.cleartext is true — staging release APK must use HTTPS only.",
    );
    process.exit(1);
  }
  console.log(
    "Verified: bundled assets, no live-reload URL, cleartext/debug off.",
  );
}

function buildReleaseApk() {
  assertReleaseSigning();

  delete process.env.CAP_LIVE_RELOAD;
  delete process.env.CAP_SERVER_URL;

  if (!skipSync) {
    console.log("Syncing Capacitor against staging (release flags)…");
    run(isWin ? "npm.cmd" : "npm", ["run", "cap:staging"], {
      env: { FIELD_CAP_RELEASE: "1" },
    });
  } else {
    console.log("Skipping Cap sync (APK_STAGING_SKIP_SYNC=1).");
  }

  assertNoLiveReload();

  if (!existsSync(gradle)) {
    console.error(`Gradle wrapper not found at ${gradle}`);
    process.exit(1);
  }

  const javaHome = resolveJavaHome();
  if (javaHome) {
    console.log(`\nUsing JAVA_HOME=${javaHome}`);
  } else {
    console.warn("\nWARNING: JAVA_HOME not set; Gradle may fail without JDK 21.");
  }

  const gradleArgs = ["assembleRelease"];
  if (process.env.FIELD_VERSION_CODE) {
    gradleArgs.push(`-PfieldVersionCode=${process.env.FIELD_VERSION_CODE}`);
  }
  if (process.env.FIELD_VERSION_NAME) {
    gradleArgs.push(`-PfieldVersionName=${process.env.FIELD_VERSION_NAME}`);
  }

  console.log("\nAssembling signed release APK…");
  run(gradle, gradleArgs, {
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
  const sizeMb = (statSync(apkDest).size / (1024 * 1024)).toFixed(1);
  console.log(`\nRelease APK ready (${sizeMb} MB):\n  ${apkDest}`);
}

function serveApk() {
  if (!existsSync(apkDest)) {
    console.error(`Missing ${apkDest}. Run without --serve skip.`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (urlPath === "/" || urlPath === "/index.html") {
      const sizeMb = (statSync(apkDest).size / (1024 * 1024)).toFixed(1);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Field staging APK</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.45}
  a{display:inline-block;margin-top:1rem;padding:.75rem 1.1rem;background:#732e75;color:#fff;text-decoration:none;border-radius:.5rem;font-weight:600}
</style></head><body>
<h1>Field (staging)</h1>
<p>Signed release APK (${sizeMb} MB) → staging API. On Android, open the link and allow install from this browser if prompted.</p>
<p><a href="/${apkName}">Download ${apkName}</a></p>
</body></html>`);
      return;
    }

    if (urlPath === `/${apkName}`) {
      const { size } = statSync(apkDest);
      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": size,
        "Content-Disposition": `attachment; filename="${apkName}"`,
      });
      createReadStream(apkDest).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  server.on("error", (err) => {
    if (err && typeof err === "object" && "code" in err && err.code === "EADDRINUSE") {
      console.error(
        `\nPort ${port} is already in use. Free it, or pick another:\n` +
          `  $env:APK_SERVE_PORT=8766; npm run apk:staging -- --serve\n` +
          `Or serve the APK you already built (no rebuild):\n` +
          `  $env:APK_STAGING_SKIP_BUILD='1'; $env:APK_SERVE_PORT=8766; npm run apk:staging -- --serve\n`,
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, "0.0.0.0", () => {
    const addrs = lanAddresses();
    console.log(`\nServing ${apkName} on port ${port}`);
    console.log("Open on your phone (same Wi‑Fi):");
    if (addrs.length === 0) {
      console.log(`  http://<your-lan-ip>:${port}/${apkName}`);
    } else {
      for (const ip of addrs) {
        console.log(`  http://${ip}:${port}/${apkName}`);
      }
    }
    console.log("\nPress Ctrl+C to stop.\n");
  });
}

if (!skipBuild) {
  buildReleaseApk();
} else {
  console.log("Skipping build (APK_STAGING_SKIP_BUILD=1).");
  if (!existsSync(apkDest)) {
    console.error(`Missing ${apkDest}. Run without APK_STAGING_SKIP_BUILD.`);
    process.exit(1);
  }
}
if (serve) {
  serveApk();
} else {
  console.log(`
Sideload: copy to the phone, or re-run with --serve:
  npm run apk:staging -- --serve
`);
}
