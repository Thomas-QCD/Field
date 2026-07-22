/**
 * Re-apply S3 CORS for field-dev-attachments (web + Capacitor live reload).
 *
 * Usage:
 *   node scripts/s3-cors.mjs
 *   node scripts/s3-cors.mjs --ip 192.168.1.10
 *
 * When your LAN IP changes (physical device live reload), re-run this script.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { networkInterfaces } from "node:os";

const BUCKET = process.env.S3_BUCKET || "field-dev-attachments";
const REGION = process.env.AWS_REGION || "us-west-1";

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

const ipArgIdx = process.argv.indexOf("--ip");
const lanIp =
  ipArgIdx >= 0 && process.argv[ipArgIdx + 1]
    ? process.argv[ipArgIdx + 1]
    : lanIPv4();

/** @type {string[]} */
const origins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://10.0.2.2:5173",
  "capacitor://localhost",
  "http://localhost",
  // Capacitor Android WebView (bundled / non-live).
  "https://localhost",
];
if (lanIp) {
  origins.push(`http://${lanIp}:5173`);
} else {
  console.warn(
    "No LAN IPv4 found — skipping device live-reload origin. Pass --ip <addr> if needed.",
  );
}

const cors = {
  CORSRules: [
    {
      AllowedOrigins: origins,
      AllowedMethods: ["GET", "PUT", "HEAD", "DELETE"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length"],
      MaxAgeSeconds: 3000,
    },
  ],
};

const corsPath = join(tmpdir(), `field-s3-cors-${Date.now()}.json`);
writeFileSync(corsPath, JSON.stringify(cors), "utf8");

try {
  execFileSync(
    "aws",
    [
      "s3api",
      "put-bucket-cors",
      "--bucket",
      BUCKET,
      "--cors-configuration",
      `file://${corsPath}`,
      "--region",
      REGION,
    ],
    { stdio: "inherit" },
  );
  console.log(`Updated CORS on s3://${BUCKET} (${REGION})`);
  console.log("AllowedOrigins:");
  for (const o of origins) console.log(`  ${o}`);
} finally {
  try {
    unlinkSync(corsPath);
  } catch {
    // ignore
  }
}
