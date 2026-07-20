/**
 * Import Wodely user list CSV into users.
 *
 * Usage:
 *   node scripts/import-users.mjs
 *   node scripts/import-users.mjs --dry-run
 *   node scripts/import-users.mjs "path/to/users.csv"
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SECRET_ARN =
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";
const HOST = "field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com";
const PORT = 5432;
const DATABASE = "field";
const USER = "field_admin";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvArg = args.find((a) => !a.startsWith("--"));
const csvPath = resolve(root, csvArg ?? "User List - Wodely - 2026-07-16.csv");

function getPassword() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return decodeURIComponent(url.password);
  }

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

function readCsvText(path) {
  const buf = readFileSync(path);
  const cp1252 = {
    0x80: "€",
    0x82: "‚",
    0x83: "ƒ",
    0x84: "„",
    0x85: "…",
    0x86: "†",
    0x87: "‡",
    0x88: "ˆ",
    0x89: "‰",
    0x8a: "Š",
    0x8b: "‹",
    0x8c: "Œ",
    0x8e: "Ž",
    0x91: "‘",
    0x92: "’",
    0x93: "“",
    0x94: "”",
    0x95: "•",
    0x96: "–",
    0x97: "—",
    0x98: "˜",
    0x99: "™",
    0x9a: "š",
    0x9b: "›",
    0x9c: "œ",
    0x9e: "ž",
    0x9f: "Ÿ",
  };
  let text = "";
  for (const byte of buf) {
    if (byte < 0x80) text += String.fromCharCode(byte);
    else text += cp1252[byte] ?? String.fromCharCode(byte);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && next === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeSpace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Field admins — everyone else is crew regardless of Wodely "Admin" label. */
const ADMIN_DISPLAY_NAMES = new Set([
  "carmen cabrera",
  "jed feller",
  "thomas vargas",
  "nikki quintanar",
  "justin acklin",
  "justin kong",
]);

function parseNameAndRole(rawName) {
  const collapsed = normalizeSpace(rawName);
  const adminMatch = collapsed.match(/^(.*?)\s+Admin$/i);
  const display_name = adminMatch ? adminMatch[1] : collapsed;
  const role = ADMIN_DISPLAY_NAMES.has(display_name.toLowerCase())
    ? "admin"
    : "crew";
  return { display_name, role };
}

function normalizePhone(raw) {
  const s = normalizeSpace(raw);
  if (!s) return null;
  // Export occasionally puts an email in the Phone column
  if (isEmail(s)) return null;
  return s.slice(0, 50);
}

function normalizeEmail(raw) {
  const s = normalizeSpace(raw).toLowerCase();
  if (!s) return null;
  if (!isEmail(s)) {
    throw new Error(`Invalid email: ${raw}`);
  }
  return s.slice(0, 255);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = readCsvText(csvPath);
const csvRows = parseCsv(text);
const [header, ...dataRows] = csvRows;
const expected = ["Name", "Email", "Phone", "ID"];
if (!header || expected.some((h, i) => header[i] !== h)) {
  throw new Error(
    `Unexpected CSV header: ${JSON.stringify(header)}. Expected ${JSON.stringify(expected)}`,
  );
}

const users = [];
const warnings = [];

for (const cols of dataRows) {
  if (cols.every((c) => !normalizeSpace(c ?? ""))) continue;

  const rawName = cols[0] ?? "";
  const rawEmail = cols[1] ?? "";
  const rawPhone = cols[2] ?? "";
  const id = normalizeSpace(cols[3] ?? "").toLowerCase();

  if (!UUID_RE.test(id)) {
    throw new Error(`Invalid user ID for "${rawName}": ${cols[3]}`);
  }

  const { display_name, role } = parseNameAndRole(rawName);
  if (!display_name) {
    throw new Error(`Empty display name for id ${id}`);
  }

  const phone = normalizePhone(rawPhone);
  if (normalizeSpace(rawPhone) && isEmail(normalizeSpace(rawPhone))) {
    warnings.push(
      `${display_name}: Phone column looked like email (${normalizeSpace(rawPhone)}); stored phone as null`,
    );
  }

  users.push({
    id,
    display_name: display_name.slice(0, 255),
    email: normalizeEmail(rawEmail),
    phone,
    role,
  });
}

const admins = users.filter((u) => u.role === "admin").length;
const crew = users.filter((u) => u.role === "crew").length;

console.log(`CSV: ${csvPath}`);
console.log(`Parsed ${users.length} users (${admins} admin, ${crew} crew)`);
for (const w of warnings) console.log(` warning: ${w}`);

if (dryRun) {
  for (const u of users.slice(0, 4)) {
    console.log(" sample:", JSON.stringify(u));
  }
  const rick = users.find((u) => u.display_name.includes("Rick"));
  const joe = users.find((u) => u.display_name.includes("Joe"));
  if (rick) console.log(" crew sample:", JSON.stringify(rick));
  if (joe) console.log(" phone-fix sample:", JSON.stringify(joe));
  console.log("(dry-run — no database writes)");
  process.exit(0);
}

const password = getPassword();
const client = new pg.Client({
  host: HOST,
  port: PORT,
  database: DATABASE,
  user: USER,
  password,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const { rows: existing } = await client.query(
    "SELECT count(*)::int AS n FROM users",
  );
  if (existing[0].n > 0) {
    throw new Error(
      `users already has ${existing[0].n} rows. Truncate or clear before re-import.`,
    );
  }

  await client.query("BEGIN");

  for (const u of users) {
    await client.query(
      `INSERT INTO users (id, display_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [u.id, u.display_name, u.email, u.phone, u.role],
    );
  }

  await client.query("COMMIT");
  console.log(`Imported: ${users.length} users`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
