/**
 * Import Wodely task search dump (or live API window) into Field Postgres.
 *
 * Usage:
 *   node scripts/import-wodely-tasks.mjs path/to/dump.json
 *   node scripts/import-wodely-tasks.mjs --fetch 2026-07-22 2026-07-29
 *   node scripts/import-wodely-tasks.mjs --dry-run path/to/dump.json
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { persistFieldTask } from "../aws/lambdas/_shared/persistFieldTask.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SECRET_ARN =
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";
const HOST = "field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com";
const PORT = 5432;
const DATABASE = "field";
const USER = "field_admin";

const WODELY_API_KEY =
  process.env.WODELY_API_KEY ||
  "pk-4a19da85-b-46f62a66-205a-42af-9dab-a7d3778588b6";
const WODELY_API_URL = "https://api.wodely.com/v2/tasks/search";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fetchIdx = args.indexOf("--fetch");
const idsIdx = args.indexOf("--ids");

/** @type {Set<number> | null} */
let idFilter = null;
if (idsIdx >= 0) {
  const idsPath = args[idsIdx + 1];
  if (!idsPath) throw new Error("Usage: --ids <ids.json>");
  const raw = JSON.parse(readFileSync(resolve(root, idsPath), "utf8"));
  const list = Array.isArray(raw) ? raw : raw.ids;
  idFilter = new Set(list.map(Number));
}

const skip = new Set();
if (fetchIdx >= 0) {
  skip.add(args[fetchIdx + 1]);
  skip.add(args[fetchIdx + 2]);
}
if (idsIdx >= 0) skip.add(args[idsIdx + 1]);
const positional = args.filter(
  (a) => !a.startsWith("--") && !skip.has(a),
);

function getPassword() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return decodeURIComponent(url.password);
  }
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;

  const raw = execFileSync(
    "aws",
    [
      "secretsmanager",
      "get-secret-value",
      "--region",
      "us-west-1",
      "--secret-id",
      SECRET_ARN,
      "--query",
      "SecretString",
      "--output",
      "text",
    ],
    { encoding: "utf8" },
  ).trim();

  const parsed = JSON.parse(raw);
  if (!parsed.password) {
    throw new Error("Secrets Manager payload missing password");
  }
  return parsed.password;
}

function loadTasksFromFile(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  throw new Error(`Expected array or { data: [] } in ${path}`);
}

async function fetchTasks(startIso, endIso) {
  const start = startIso.includes("T")
    ? startIso
    : `${startIso}T00:00:00.000Z`;
  const end = endIso.includes("T") ? endIso : `${endIso}T23:59:59.999Z`;

  const res = await fetch(WODELY_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${WODELY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDateTime: start,
      endDateTime: end,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || `Wodely API failed (${res.status})`);
  }
  if (!Array.isArray(json.data)) {
    throw new Error("Wodely API response missing data[]");
  }
  return json.data;
}

async function main() {
  /** @type {Record<string, unknown>[]} */
  let tasks;

  if (fetchIdx >= 0) {
    const start = args[fetchIdx + 1];
    const end = args[fetchIdx + 2];
    if (!start || !end) {
      throw new Error("Usage: --fetch <startDate> <endDate>");
    }
    console.log(`Fetching Wodely tasks ${start} → ${end}…`);
    tasks = await fetchTasks(start, end);
  } else {
    const fileArg = positional[0];
    if (!fileArg) {
      throw new Error(
        "Usage:\n  node scripts/import-wodely-tasks.mjs <dump.json>\n  node scripts/import-wodely-tasks.mjs --fetch 2026-07-22 2026-07-29",
      );
    }
    const path = resolve(root, fileArg);
    console.log(`Reading ${path}…`);
    tasks = loadTasksFromFile(path);
  }

  if (idFilter) {
    const before = tasks.length;
    tasks = tasks.filter((t) => idFilter.has(Number(t.id)));
    console.log(`Filtered by --ids: ${before} → ${tasks.length}`);
    const missing = [...idFilter].filter(
      (id) => !tasks.some((t) => Number(t.id) === id),
    );
    if (missing.length) {
      console.warn(`Missing from source (${missing.length}):`, missing.join(", "));
    }
  }

  console.log(`Tasks to import: ${tasks.length}${dryRun ? " (dry-run)" : ""}`);

  if (dryRun) {
    for (const t of tasks) {
      console.log("DRY", { id: t.id, status: t.statusDesc, type: t.typeDesc });
    }
    return;
  }

  const password = getPassword();
  const pool = new pg.Pool({
    host: HOST,
    port: PORT,
    database: DATABASE,
    user: USER,
    password,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  try {
    for (const raw of tasks) {
      try {
        const result = await persistFieldTask(raw, { pool });
        if (result?.skipped) skipped += 1;
        else upserted += 1;
      } catch (err) {
        errors += 1;
        console.error("IMPORT_FAILED", {
          id: raw?.id,
          message: err?.message ?? String(err),
        });
      }
    }
  } finally {
    await pool.end();
  }

  console.log("IMPORT_SUMMARY", { total: tasks.length, upserted, skipped, errors });
  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
