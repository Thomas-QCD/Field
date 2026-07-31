/**
 * Manually rotate the field-dev RDS master password and refresh consumers.
 *
 * Automatic Secrets Manager rotation is left disabled (manual-only).
 *
 * Steps:
 *  1. Rotate via RDS (`--rotate-master-user-password`)
 *  2. Wait until Secrets Manager LastRotatedDate advances
 *  3. Force a new staging ECS deployment (injected PGPASSWORD)
 *  4. Wait for ECS rollout + /api/health
 *  5. Recycle Wodely Lambdas that cache the password in warm runtimes
 *  6. Remind about local `npm run dev` / embedded .env passwords
 *
 * Usage: npm run db:rotate-secret
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGION = process.env.AWS_REGION || "us-west-1";
const DB_INSTANCE = process.env.RDS_INSTANCE_ID || "field-dev";
const SECRET_ARN =
  process.env.DB_SECRET_ARN ||
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";
const HOST = "field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com";
const DATABASE = "field";
const USER = "field_admin";

/** Lambdas that import aws/lambdas/_shared/db.mjs (password cached per warm runtime). */
const FIELD_DB_LAMBDAS = ["WOO-message-handler", "updateModifiedWooTasks"];

function aws(args, { json = false } = {}) {
  const out = execFileSync("aws", [...args, "--region", REGION], {
    encoding: "utf8",
    cwd: ROOT,
  }).trim();
  if (!json) return out;
  return out ? JSON.parse(out) : null;
}

function log(msg) {
  console.log(msg);
}

function describeSecret() {
  return aws(
    [
      "secretsmanager",
      "describe-secret",
      "--secret-id",
      SECRET_ARN,
      "--query",
      "{RotationEnabled:RotationEnabled,LastRotatedDate:LastRotatedDate,NextRotationDate:NextRotationDate}",
      "--output",
      "json",
    ],
    { json: true },
  );
}

function ensureAutoRotationOff() {
  const info = describeSecret();
  if (info?.RotationEnabled) {
    log("Disabling automatic rotation (keeping manual-only)…");
    aws(["secretsmanager", "cancel-rotate-secret", "--secret-id", SECRET_ARN]);
  }
}

function rotateMasterPassword() {
  log(`Rotating master password on RDS instance ${DB_INSTANCE}…`);
  aws([
    "rds",
    "modify-db-instance",
    "--db-instance-identifier",
    DB_INSTANCE,
    "--rotate-master-user-password",
    "--apply-immediately",
    "--output",
    "json",
  ]);
}

async function waitForSecretRotation(previousLastRotated) {
  const prevMs = previousLastRotated
    ? Date.parse(previousLastRotated)
    : 0;
  const deadline = Date.now() + 10 * 60 * 1000;
  log("Waiting for Secrets Manager rotation to finish…");
  while (Date.now() < deadline) {
    const info = describeSecret();
    const nextMs = info?.LastRotatedDate
      ? Date.parse(info.LastRotatedDate)
      : 0;
    if (nextMs > prevMs) {
      log(`Secret rotated at ${info.LastRotatedDate}`);
      return info;
    }
    await sleep(5000);
  }
  throw new Error(
    "Timed out waiting for Secrets Manager LastRotatedDate to advance",
  );
}

function ssmOptional(name) {
  try {
    return aws([
      "ssm",
      "get-parameter",
      "--name",
      name,
      "--query",
      "Parameter.Value",
      "--output",
      "text",
    ]);
  } catch {
    return null;
  }
}

async function forceEcsRedeploy() {
  const cluster = ssmOptional("/field/staging/cluster-name");
  const service = ssmOptional("/field/staging/service-name");
  const url = ssmOptional("/field/staging/url");
  if (!cluster || !service) {
    log(
      "Skipping ECS redeploy (SSM /field/staging/cluster-name or service-name missing).",
    );
    return null;
  }

  log(`Forcing new ECS deployment: ${cluster}/${service}…`);
  aws([
    "ecs",
    "update-service",
    "--cluster",
    cluster,
    "--service",
    service,
    "--force-new-deployment",
    "--desired-count",
    "1",
    "--output",
    "json",
  ]);

  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    const svc = aws(
      [
        "ecs",
        "describe-services",
        "--cluster",
        cluster,
        "--services",
        service,
        "--query",
        "services[0].{running:runningCount,desired:desiredCount,deployments:deployments}",
        "--output",
        "json",
      ],
      { json: true },
    );
    const deps = svc?.deployments || [];
    const primary = deps.find((d) => d.status === "PRIMARY");
    const onlyPrimary = deps.length === 1;
    const done =
      svc?.running >= 1 &&
      onlyPrimary &&
      primary?.rolloutState === "COMPLETED";
    log(
      `  ECS running=${svc?.running}/${svc?.desired} rollout=${primary?.rolloutState || "?"} deployments=${deps.length}`,
    );
    if (done) break;
    await sleep(15000);
  }

  if (url) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.text();
      log(`Staging health: ${body}`);
    } catch (err) {
      log(
        `Warning: could not reach staging health endpoint (${err instanceof Error ? err.message : err})`,
      );
    }
  }

  return { cluster, service, url };
}

function recycleLambdas() {
  const stamp = new Date().toISOString();
  for (const name of FIELD_DB_LAMBDAS) {
    let cfg;
    try {
      cfg = aws(
        [
          "lambda",
          "get-function-configuration",
          "--function-name",
          name,
          "--output",
          "json",
        ],
        { json: true },
      );
    } catch {
      log(`Skipping Lambda ${name} (not found or no access).`);
      continue;
    }

    const variables = {
      ...(cfg.Environment?.Variables || {}),
      DB_CREDENTIALS_ROTATED_AT: stamp,
    };
    const payload = {
      FunctionName: name,
      Environment: { Variables: variables },
    };
    const tmp = join(tmpdir(), `field-lambda-env-${name}-${Date.now()}.json`);
    writeFileSync(tmp, JSON.stringify(payload));
    try {
      log(`Recycling Lambda warm runtimes: ${name}…`);
      aws([
        "lambda",
        "update-function-configuration",
        "--cli-input-json",
        `file://${tmp}`,
        "--output",
        "json",
      ]);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  }
}

async function smokeTestDb() {
  log("Smoke-testing DB login with current Secrets Manager password…");
  const raw = aws([
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    SECRET_ARN,
    "--query",
    "SecretString",
    "--output",
    "text",
  ]);
  const parsed = JSON.parse(raw);
  if (!parsed.password) {
    throw new Error("Secrets Manager payload missing password");
  }
  const client = new pg.Client({
    host: HOST,
    port: 5432,
    database: DATABASE,
    user: USER,
    password: parsed.password,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query("select 1");
    log("DB login OK.");
  } finally {
    await client.end().catch(() => {});
  }
}

function warnLocalConsumers() {
  const envPath = join(ROOT, ".env");
  let embedsPassword = false;
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trimStart().startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (key === "PGPASSWORD" && val) embedsPassword = true;
      if (key === "DATABASE_URL" && val) {
        try {
          if (new URL(val).password) embedsPassword = true;
        } catch {
          // ignore malformed
        }
      }
    }
  }

  log("");
  log("Local follow-up:");
  log("  • Restart the API if it is running: npm run dev:stop && npm run dev");
  if (embedsPassword) {
    log(
      "  • Your .env embeds a DB password (DATABASE_URL and/or PGPASSWORD). Clear those so tools fetch from Secrets Manager, or update them to the new password.",
    );
  } else {
    log(
      "  • .env does not embed a DB password (good) — local tools will fetch the new secret on next start.",
    );
  }
}

async function main() {
  const before = describeSecret();
  log(
    `Before: RotationEnabled=${before?.RotationEnabled} LastRotated=${before?.LastRotatedDate || "none"}`,
  );

  rotateMasterPassword();
  await waitForSecretRotation(before?.LastRotatedDate);
  ensureAutoRotationOff();

  await smokeTestDb();
  await forceEcsRedeploy();
  recycleLambdas();
  ensureAutoRotationOff();

  const after = describeSecret();
  log("");
  log(
    `Done. RotationEnabled=${after?.RotationEnabled} LastRotated=${after?.LastRotatedDate}`,
  );
  warnLocalConsumers();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
