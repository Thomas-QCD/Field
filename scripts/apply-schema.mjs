import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPgClient } from "./lib/db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlPath = resolve(
  root,
  process.argv[2] ?? "db/migrations/001_initial_schema.sql",
);

const sql = readFileSync(sqlPath, "utf8");
const client = createPgClient();

await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log(`Applied ${sqlPath}`);
  console.log(`Tables (${rows.length}): ${rows.map((r) => r.table_name).join(", ")}`);
} finally {
  await client.end();
}
