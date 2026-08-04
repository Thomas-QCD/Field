/**
 * Send a test outbound email via the Field email pipeline (SES by default).
 *
 * Usage:
 *   npm run email:test
 *   npm run email:test -- --task-id 123
 *   npm run email:test -- --to someone@example.com
 *
 * Defaults: To thomas@qcdlv.com; latest non-deleted task if --task-id omitted.
 * Body: emails/order-delivered.html (logo inlined as data URI).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "../server/loadEnv.mjs";
import { getPool } from "../server/db.mjs";
import { dispatchOutboundEmail } from "../server/emailDeliveries.mjs";
import { getEmailFrom } from "../server/email.mjs";

const DEFAULT_TO = "thomas@qcdlv.com";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "emails", "order-delivered.html");
const LOGO_PATH = path.join(ROOT, "emails", "logo-white.png");

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

/**
 * @param {number | null} explicit
 */
async function loadTaskContext(explicit) {
  const pool = getPool();
  if (explicit != null) {
    const { rows } = await pool.query(
      `SELECT t.id,
              t.job_title,
              t.completed_at,
              a.address_name AS destination_name
       FROM tasks t
       LEFT JOIN addresses a ON a.id = t.destination_address_id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [explicit],
    );
    if (!rows[0]) {
      throw new Error(`Task ${explicit} not found (or deleted)`);
    }
    return rows[0];
  }
  const { rows } = await pool.query(
    `SELECT t.id,
            t.job_title,
            t.completed_at,
            a.address_name AS destination_name
     FROM tasks t
     LEFT JOIN addresses a ON a.id = t.destination_address_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.id DESC
     LIMIT 1`,
  );
  if (!rows[0]) {
    throw new Error("No tasks in database — create a task or pass --task-id");
  }
  return rows[0];
}

/**
 * @param {{ id: number; job_title: string | null; completed_at: Date | string | null; destination_name: string | null }} task
 */
async function buildOrderDeliveredHtml(task) {
  let html = await readFile(TEMPLATE_PATH, "utf8");
  const logoBuf = await readFile(LOGO_PATH);
  const logoDataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;

  const completedAt = task.completed_at
    ? new Date(task.completed_at).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });

  const replacements = {
    "{{contact_name}}": "there",
    "{{job_title}}": task.job_title?.trim() || `Order ${task.id}`,
    "{{destination_name}}": task.destination_name?.trim() || "your destination",
    "{{completed_at}}": completedAt,
    'src="logo-white.png"': `src="${logoDataUri}"`,
  };

  for (const [from, to] of Object.entries(replacements)) {
    html = html.split(from).join(to);
  }
  return html;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const task = await loadTaskContext(args.taskId);
  const taskId = Number(task.id);
  const provider = (process.env.EMAIL_PROVIDER || "ses").trim().toLowerCase();
  const from = getEmailFrom();
  const subject = "Your order has been delivered!";
  const html = await buildOrderDeliveredHtml(task);
  const text = [
    "Your order has been delivered!",
    "",
    `Order: ${task.job_title?.trim() || `Order ${taskId}`}`,
    `Delivered to: ${task.destination_name?.trim() || "your destination"}`,
    "",
    "Thanks for choosing Quick Change Display.",
  ].join("\n");

  console.log(
    `Sending order-delivered email (provider=${provider}, from=${from}, to=${args.to}, taskId=${taskId})…`,
  );

  const result = await dispatchOutboundEmail({
    taskId,
    trigger: "manual_test",
    to: args.to,
    subject,
    text,
    html,
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
