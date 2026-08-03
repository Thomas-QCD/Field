/**
 * Wipe all tasks and related rows (attachments, documents, email log,
 * crew GPS events, crew members, contacts, completion notes).
 *
 * Does not touch users, contacts, or addresses masters.
 *
 * Usage:
 *   node scripts/wipe-tasks.mjs --dry-run
 *   node scripts/wipe-tasks.mjs --confirm
 *   node scripts/wipe-tasks.mjs --confirm --purge-s3
 *
 * --purge-s3  Also delete S3 objects referenced by task_attachments /
 *             task_documents (best-effort; missing keys are ignored).
 */
import {
  DeleteObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPgClient } from "./lib/db.mjs";

const REGION = process.env.AWS_REGION || "us-west-1";
const BUCKET = process.env.S3_BUCKET || "field-dev-attachments";

const dryRun = process.argv.includes("--dry-run");
const confirm = process.argv.includes("--confirm");
const purgeS3 = process.argv.includes("--purge-s3");

/**
 * @param {import("pg").Client} client
 */
async function countRelated(client) {
  const tables = [
    "tasks",
    "task_attachments",
    "task_documents",
    "email_deliveries",
    "task_crew_events",
    "task_history_events",
    "task_crew_members",
    "task_contacts",
    "task_completion_notes",
  ];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const table of tables) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM ${table}`,
    );
    counts[table] = rows[0].c;
  }
  return counts;
}

/**
 * @param {string[]} keys
 */
async function deleteS3Keys(keys) {
  if (keys.length === 0) {
    console.log("No S3 keys to purge.");
    return;
  }

  const s3 = new S3Client({ region: REGION });
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const out = await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    deleted += chunk.length - (out.Errors?.length ?? 0);
    errors += out.Errors?.length ?? 0;
    for (const err of out.Errors ?? []) {
      console.warn(`S3 delete failed ${err.Key}: ${err.Code} ${err.Message}`);
    }
  }

  console.log(
    `S3 purge on ${BUCKET}: ${deleted} ok` +
      (errors ? `, ${errors} failed` : ""),
  );
}

async function main() {
  if (!dryRun && !confirm) {
    console.error(
      "Refusing to wipe without --confirm (or use --dry-run to preview).",
    );
    process.exitCode = 1;
    return;
  }

  const client = createPgClient();
  await client.connect();

  try {
    const before = await countRelated(client);
    console.log("Current counts:", before);

    if (dryRun) {
      console.log(
        `Dry run: would wipe ${before.tasks} tasks and related rows` +
          (purgeS3 ? " (+ purge S3 objects)" : ""),
      );
      return;
    }

    /** @type {string[]} */
    let storageKeys = [];
    if (purgeS3) {
      const { rows } = await client.query(`
        SELECT storage_key FROM task_attachments
        UNION
        SELECT storage_key FROM task_documents
      `);
      storageKeys = [
        ...new Set(
          rows
            .map((r) => r.storage_key)
            .filter((k) => typeof k === "string" && k.length > 0),
        ),
      ];
      console.log(`Collected ${storageKeys.length} distinct S3 keys.`);
    }

    await client.query("BEGIN");

    console.log(`Wiping ${before.tasks} tasks…`);

    // NO ACTION FK children first
    await client.query(`DELETE FROM task_attachments`);
    await client.query(`DELETE FROM task_documents`);
    await client.query(`DELETE FROM email_deliveries`);
    await client.query(`DELETE FROM task_crew_events`);
    await client.query(`DELETE FROM task_history_events`);
    // CASCADE: task_crew_members, task_contacts, task_completion_notes
    await client.query(`DELETE FROM tasks`);

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('tasks', 'id'),
        COALESCE((SELECT MAX(id) FROM tasks), 1),
        (SELECT MAX(id) FROM tasks) IS NOT NULL
      )
    `);

    await client.query("COMMIT");

    if (purgeS3) {
      await deleteS3Keys(storageKeys);
    }

    const after = await countRelated(client);
    console.log("After wipe:", after);
    console.log("Done.");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    await client.end();
  }
}

await main();
