/**
 * Re-apply S3 CORS for field-dev-attachments (web + Capacitor live reload + staging).
 *
 * Usage:
 *   node scripts/s3-cors.mjs
 *   node scripts/s3-cors.mjs --ip 192.168.1.10
 *   node scripts/s3-cors.mjs --staging-origin https://dxxxx.cloudfront.net
 *
 * When your LAN IP changes (physical device live reload), re-run this script.
 * After staging CloudFront exists, pass --staging-origin or set STAGING_ORIGIN;
 * otherwise SSM /field/staging/url is used when AWS credentials work.
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

function readStagingOrigin() {
  const argIdx = process.argv.indexOf("--staging-origin");
  if (argIdx >= 0 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1].replace(/\/$/, "");
  }
  if (process.env.STAGING_ORIGIN) {
    return process.env.STAGING_ORIGIN.replace(/\/$/, "");
  }
  try {
    return execFileSync(
      "aws",
      [
        "ssm",
        "get-parameter",
        "--name",
        "/field/staging/url",
        "--query",
        "Parameter.Value",
        "--output",
        "text",
        "--region",
        REGION,
      ],
      { encoding: "utf8" },
    )
      .trim()
      .replace(/\/$/, "");
  } catch {
    return null;
  }
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

const stagingOrigin = readStagingOrigin();
if (stagingOrigin) {
  origins.push(stagingOrigin);
  console.log(`Including staging origin: ${stagingOrigin}`);
} else {
  console.warn(
    "No staging CloudFront URL found (SSM /field/staging/url). Pass --staging-origin after deploy.",
  );
}

const cors = {
  CORSRules: [
    {
      AllowedOrigins: origins,
      AllowedMethods: ["GET", "PUT", "HEAD", "DELETE"],
      AllowedHeaders: ["*"],
      ExposeHeaders: [
        "ETag",
        "Content-Length",
        "Content-Type",
        "Content-Range",
        "Accept-Ranges",
        "Content-Disposition",
      ],
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
