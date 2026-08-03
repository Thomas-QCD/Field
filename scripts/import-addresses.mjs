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
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPgClient } from "./lib/db.mjs";
import { parseCsv, readCsvText } from "./lib/csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const replace = args.includes("--replace");
const clearContacts = args.includes("--clear-contacts");
const csvArg = args.find((a) => !a.startsWith("--"));
const csvPath = resolve(root, csvArg ?? "Contact List 2026-07-15.csv");


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

const client = createPgClient();

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
