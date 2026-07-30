/**
 * Build the web app pointed at staging CloudFront and sync into Capacitor.
 *
 * Reads /field/staging/url from SSM (same stack as web:staging / api:staging).
 * Usage: npm run cap:staging
 *
 * Then open Android Studio / Xcode and Run a release-style (bundled) install.
 * Live reload (`cap:live`) still talks to the local Vite/API — use this for
 * dogfooding against the real staging backend.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGION = process.env.AWS_REGION || "us-west-1";

function ssm(name) {
  return execFileSync(
    "aws",
    [
      "ssm",
      "get-parameter",
      "--name",
      name,
      "--query",
      "Parameter.Value",
      "--output",
      "text",
      "--region",
      REGION,
    ],
    { encoding: "utf8" },
  ).trim();
}

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    shell: process.platform === "win32",
    ...opts,
  });
}

const stagingUrl = (process.env.VITE_API_BASE || ssm("/field/staging/url")).replace(
  /\/$/,
  "",
);

console.log(`Capacitor staging API: ${stagingUrl}`);

run("npm", ["run", "build"], {
  env: {
    ...process.env,
    VITE_API_BASE: stagingUrl,
    // Staging mobile uses QR device sessions — do not bake Entra into Cap builds.
    VITE_AZURE_CLIENT_ID: "",
    VITE_AZURE_TENANT_ID: "",
  },
});

run("npx", ["cap", "sync"], {
  env: {
    ...process.env,
    // Preserve release hardening when invoked from apk:staging.
    ...(process.env.FIELD_CAP_RELEASE
      ? { FIELD_CAP_RELEASE: process.env.FIELD_CAP_RELEASE }
      : {}),
  },
});

const openIdx = process.argv.indexOf("--open");
const openTarget =
  openIdx >= 0 && process.argv[openIdx + 1]
    ? process.argv[openIdx + 1].toLowerCase()
    : null;
if (openTarget === "android" || openTarget === "ios") {
  run("npx", ["cap", "open", openTarget]);
}

console.log(`
Synced Capacitor projects against ${stagingUrl}

Next (do not run npm run cap:android / cap:ios — those re-sync without staging):
  npx cap open android
  npx cap open ios          # macOS
  npm run cap:staging -- --open android

Smoke on device: staging web Users → Issue QR → activate in app → tasks → photo → revoke.
Back to local API defaults: npm run cap:sync
`);
