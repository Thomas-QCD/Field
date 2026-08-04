/**
 * Unauthenticated customer tracking: task summary, safe history, PDF download.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./db.mjs";
import { generateAndStoreDeliveryDocket } from "./deliveryDocket.mjs";
import { getPublicTaskHistory } from "./taskHistory.mjs";
import { publicTrackingPath, publicTrackingUrl } from "./publicToken.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORAGE_ROOT = path.join(ROOT, "storage");

const PUBLIC_DOC_KINDS = new Set(["delivery_docket", "pod"]);

/**
 * @param {unknown} token
 * @returns {string}
 */
function normalizeToken(token) {
  if (typeof token !== "string") return "";
  return token.trim();
}

/**
 * @param {string} status
 */
function headlineForStatus(status) {
  switch (status) {
    case "Completed":
      return "Your order has been delivered!";
    case "Failed":
      return "Your order could not be completed";
    case "Cancelled":
      return "Your order was cancelled";
    case "In Progress":
      return "Your order is in progress";
    case "Loaded":
      return "Your order is on the way";
    case "Assigned":
      return "Your order has been assigned";
    default:
      return "Track your order";
  }
}

/**
 * @param {string} storageKey
 */
async function readLocalDocument(storageKey) {
  const key = String(storageKey || "").replace(/^[/\\]+/, "");
  if (!key || key.includes("..")) {
    throw Object.assign(new Error("Invalid document path"), { status: 400 });
  }
  const fullPath = path.join(STORAGE_ROOT, key);
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw Object.assign(new Error("Invalid document path"), { status: 400 });
  }
  try {
    return await readFile(fullPath);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * @param {string} token
 */
export async function getPublicTaskByToken(token) {
  const publicToken = normalizeToken(token);
  if (!publicToken || publicToken.length > 64) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       t.id,
       t.status,
       t.job_title,
       t.completed_at,
       t.public_token,
       COALESCE(a.address_name, '') AS destination_name
     FROM tasks t
     LEFT JOIN addresses a ON a.id = t.destination_address_id
     WHERE t.public_token = $1
       AND t.deleted_at IS NULL`,
    [publicToken],
  );

  if (rows.length === 0) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }

  const row = rows[0];
  const taskId = Number(row.id);

  const { rows: docRows } = await pool.query(
    `SELECT kind, file_name
     FROM task_documents
     WHERE task_id = $1
       AND kind IN ('delivery_docket', 'pod')`,
    [taskId],
  );

  /** @type {Map<string, string>} */
  const byKind = new Map();
  for (const d of docRows) {
    byKind.set(String(d.kind), String(d.file_name ?? d.kind));
  }

  const documents = [
    {
      kind: "delivery_docket",
      fileName: byKind.get("delivery_docket") ?? `delivery-docket-${taskId}.pdf`,
      // Docket can be generated on demand.
      available: true,
    },
    {
      kind: "pod",
      fileName: byKind.get("pod") ?? `pod-${taskId}.pdf`,
      available: byKind.has("pod"),
    },
  ];

  const history = await getPublicTaskHistory(taskId);
  const status = String(row.status);

  return {
    jobTitle: row.job_title ?? "",
    status,
    headline: headlineForStatus(status),
    destinationName: row.destination_name ?? "",
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    documents,
    history,
    trackingPath: publicTrackingPath(String(row.public_token)),
    trackingUrl: publicTrackingUrl(String(row.public_token)),
  };
}

/**
 * Resolve task id + full task row bits needed for docket generation.
 * @param {string} token
 */
async function resolveTaskIdByToken(token) {
  const publicToken = normalizeToken(token);
  if (!publicToken || publicToken.length > 64) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM tasks WHERE public_token = $1 AND deleted_at IS NULL`,
    [publicToken],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }
  return Number(rows[0].id);
}

/**
 * @param {string} token
 * @param {string} kind
 * @param {(id: number) => Promise<Record<string, unknown> | null>} getTask
 * @returns {Promise<{ buffer: Buffer, fileName: string }>}
 */
export async function getPublicDocument(token, kind, getTask) {
  const docKind = typeof kind === "string" ? kind.trim() : "";
  if (!PUBLIC_DOC_KINDS.has(docKind)) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }

  const taskId = await resolveTaskIdByToken(token);
  const pool = getPool();

  if (docKind === "delivery_docket") {
    const { rows } = await pool.query(
      `SELECT storage_key, file_name FROM task_documents
       WHERE task_id = $1 AND kind = 'delivery_docket'`,
      [taskId],
    );
    if (rows[0]) {
      const buf = await readLocalDocument(String(rows[0].storage_key));
      if (buf) {
        return {
          buffer: buf,
          fileName: String(rows[0].file_name || `delivery-docket-${taskId}.pdf`),
        };
      }
    }

    const task = await getTask(taskId);
    if (!task) {
      throw Object.assign(new Error("Not found"), { status: 404 });
    }
    const { buffer, fileName } = await generateAndStoreDeliveryDocket(task, {
      generatedByUserId: null,
    });
    return { buffer, fileName };
  }

  // POD — stored document only
  const { rows } = await pool.query(
    `SELECT storage_key, file_name FROM task_documents
     WHERE task_id = $1 AND kind = 'pod'`,
    [taskId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Proof of delivery is not available yet"), {
      status: 404,
    });
  }
  const buf = await readLocalDocument(String(rows[0].storage_key));
  if (!buf) {
    throw Object.assign(new Error("Proof of delivery is not available yet"), {
      status: 404,
    });
  }
  return {
    buffer: buf,
    fileName: String(rows[0].file_name || `pod-${taskId}.pdf`),
  };
}
