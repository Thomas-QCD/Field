/**
 * Import Contact List CSV into addresses.
 * CSV "Name" is the venue name → addresses.address_name.
 * Address / Building / Notes → street_line / building / notes.
 * Phone / Email are ignored (contacts are people, not places).
 *
 * Usage:
 *   node scripts/import-addresses.mjs
 *   node scripts/import-addresses.mjs --dry-run
 *   node scripts/import-addresses.mjs --replace
 *   node scripts/import-addresses.mjs --clear-contacts
 *   node scripts/import-addresses.mjs "path/to/contacts.csv"
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
const replace = args.includes("--replace");
const clearContacts = args.includes("--clear-contacts");
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

/**
 * Prefer a street-like Address value. Maps URLs keep a short placeholder so
 * street_line stays NOT NULL; the venue name still identifies the place.
 */
function resolveStreetLine(rawAddress, addressName) {
  const address = normalizeSpace(rawAddress ?? "");
  if (!address) {
    return `(see ${addressName})`.slice(0, 500);
  }
  if (/^https?:\/\//i.test(address) || /maps\.app\.goo\.gl/i.test(address)) {
    return `(maps link — ${addressName})`.slice(0, 500);
  }
  return address.slice(0, 500);
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

const addresses = [];
for (const cols of dataRows) {
  if (cols.every((c) => !normalizeSpace(c ?? ""))) continue;
  const addressName = normalizeSpace(cols[0] ?? "");
  if (!addressName) continue;

  const building = normalizeSpace(cols[4] ?? "") || null;
  const notes = normalizeSpace(cols[5] ?? "") || null;

  addresses.push({
    addressName: addressName.slice(0, 255),
    streetLine: resolveStreetLine(cols[3] ?? "", addressName),
    building: building ? building.slice(0, 255) : null,
    notes,
  });
}

console.log(`CSV: ${csvPath}`);
console.log(`Parsed ${addresses.length} addresses`);

if (dryRun) {
  for (const a of addresses.slice(0, 5)) {
    console.log(" sample:", JSON.stringify(a, null, 2));
  }
  const park = addresses.find((a) => a.addressName.includes("Park MGM"));
  if (park) console.log(" Park MGM:", JSON.stringify(park, null, 2));
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
    "SELECT count(*)::int AS n FROM addresses",
  );
  if (existing[0].n > 0 && !replace) {
    throw new Error(
      `addresses already has ${existing[0].n} rows. Pass --replace to clear and re-import.`,
    );
  }

  await client.query("BEGIN");

  if (clearContacts) {
    await client.query("DELETE FROM task_contacts");
    const { rowCount } = await client.query("DELETE FROM contacts");
    console.log(`Cleared contacts: ${rowCount ?? 0} (venue names were not people)`);
  }

  if (replace && existing[0].n > 0) {
    await client.query(
      "UPDATE tasks SET destination_address_id = NULL WHERE destination_address_id IS NOT NULL",
    );
    const { rowCount } = await client.query("DELETE FROM addresses");
    console.log(`Cleared addresses: ${rowCount ?? 0}`);
  }

  let inserts = 0;
  for (const address of addresses) {
    await client.query(
      `INSERT INTO addresses (address_name, street_line, building, notes)
       VALUES ($1, $2, $3, $4)`,
      [
        address.addressName,
        address.streetLine,
        address.building,
        address.notes,
      ],
    );
    inserts++;
  }

  await client.query("COMMIT");

  console.log(`Imported: ${inserts} addresses`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
