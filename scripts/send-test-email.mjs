/**
 * Send a test outbound email via the Field email pipeline (SES by default).
 *
 * Usage:
 *   npm run email:test
 *   npm run email:test -- --task-id 123
 *   npm run email:test -- --to someone@example.com
 *
 * Defaults: To thomas@qcdlv.com; latest non-deleted task if --task-id omitted.
 */

import "../server/loadEnv.mjs";
import { getPool } from "../server/db.mjs";
import { dispatchOutboundEmail } from "../server/emailDeliveries.mjs";
import { getEmailFrom } from "../server/email.mjs";

const DEFAULT_TO = "thomas@qcdlv.com";

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ taskId: number | null; to: string }} */
  const out = { taskId: null, to: DEFAULT_TO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--task-id") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid --task-id: ${raw}`);
      }
      out.taskId = n;
    } else if (a === "--to") {
      const raw = argv[++i];
      if (!raw?.trim()) throw new Error("Missing value for --to");
      out.to = raw.trim();
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run email:test -- [--task-id <id>] [--to <email>]
  --task-id  Task to attach the email_deliveries row (default: latest)
  --to       Recipient (default: ${DEFAULT_TO})`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

async function resolveTaskId(explicit) {
  if (explicit != null) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
      [explicit],
    );
    if (!rows[0]) {
      throw new Error(`Task ${explicit} not found (or deleted)`);
    }
    return Number(rows[0].id);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM tasks
     WHERE deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
  );
  if (!rows[0]) {
    throw new Error("No tasks in database — create a task or pass --task-id");
  }
  return Number(rows[0].id);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const taskId = await resolveTaskId(args.taskId);
  const provider = (process.env.EMAIL_PROVIDER || "ses").trim().toLowerCase();
  const from = getEmailFrom();

  console.log(
    `Sending test email (provider=${provider}, from=${from}, to=${args.to}, taskId=${taskId})…`,
  );

  const result = await dispatchOutboundEmail({
    taskId,
    trigger: "manual_test",
    to: args.to,
    subject: `Field email pipeline test (task ${taskId})`,
    text: [
      "This is a test message from the Field outbound email pipeline.",
      "",
      `Task ID: ${taskId}`,
      `Trigger: manual_test`,
      `Provider: ${provider}`,
      `Sent at: ${new Date().toISOString()}`,
    ].join("\n"),
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "sent") {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch {
      // ignore
    }
  });
