/**
 * Import people into contacts (name / phone / email).
 *
 * Do NOT use the venue "Contact List" CSV here — those Name values are places
 * (Park MGM, etc.). Import venues with scripts/import-addresses.mjs instead.
 *
 * Usage:
 *   node scripts/import-contacts.mjs
 *   node scripts/import-contacts.mjs --dry-run
 *   node scripts/import-contacts.mjs "path/to/people.csv"
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
const csvPath = resolve(root, csvArg ?? "Contact List 2026-07-15.csv");

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

/** Decode Windows-1252 contact export (curly quotes, en-dashes, etc.). */
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

function splitEmails(raw) {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ];
}

function normalizePhone(raw) {
  const s = normalizeSpace(raw);
  return s || null;
}

const text = readCsvText(csvPath);
const csvRows = parseCsv(text);
const [header, ...dataRows] = csvRows;
const expected = ["Name", "Phone", "Email", "Address", "Building", "Notes"];
if (!header || expected.some((h, i) => header[i] !== h)) {
  throw new Error(
    `Unexpected CSV header: ${JSON.stringify(header)}. Expected ${JSON.stringify(expected)}`,
  );
}

const contacts = [];
for (const cols of dataRows) {
  if (cols.every((c) => !normalizeSpace(c ?? ""))) continue;
  const name = normalizeSpace(cols[0] ?? "");
  if (!name) continue;
  const emails = splitEmails(cols[2] ?? "");
  contacts.push({
    name: name.slice(0, 255),
    phone: normalizePhone(cols[1] ?? ""),
    email: emails[0] ?? null,
    extraEmails: emails.slice(1),
  });
}

const withEmail = contacts.filter((c) => c.email).length;
const multiEmail = contacts.filter((c) => c.extraEmails.length > 0).length;

console.log(`CSV: ${csvPath}`);
console.log(
  `Parsed ${contacts.length} contacts, ${withEmail} with email (${multiEmail} had extra emails — first kept only)`,
);

if (dryRun) {
  for (const c of contacts.slice(0, 3)) {
    console.log(" sample:", JSON.stringify(c, null, 2));
  }
  const freddy = contacts.find((c) => c.name.includes("Freddy"));
  if (freddy) console.log(" encoding check:", freddy.name);
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
    "SELECT count(*)::int AS n FROM contacts",
  );
  if (existing[0].n > 0) {
    throw new Error(
      `contacts already has ${existing[0].n} rows. Truncate or clear before re-import.`,
    );
  }

  await client.query("BEGIN");

  let contactInserts = 0;

  for (const contact of contacts) {
    await client.query(
      `INSERT INTO contacts (name, phone, email)
       VALUES ($1, $2, $3)`,
      [contact.name, contact.phone, contact.email],
    );
    contactInserts++;
  }

  await client.query("COMMIT");

  console.log(`Imported: ${contactInserts} contacts`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
