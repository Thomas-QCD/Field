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
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPgClient } from "./lib/db.mjs";
import { parseCsv, readCsvText } from "./lib/csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvArg = args.find((a) => !a.startsWith("--"));
const csvPath = resolve(root, csvArg ?? "Contact List 2026-07-15.csv");

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

const client = createPgClient();

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
