/**
 * Unauthenticated customer tracking: task summary, safe history, PDF download.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./db.mjs";
import {
  CURRENT_DOCUMENT_STORAGE_PREFIX,
  generateAndStoreDeliveryDocket,
  generateAndStoreProofOfCompletion,
} from "./deliveryDocket.mjs";
import { getPublicTaskHistory } from "./taskHistory.mjs";
import { publicTrackingPath, publicTrackingUrl } from "./publicToken.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORAGE_ROOT = path.join(ROOT, "storage");

const PUBLIC_DOC_KINDS = new Set([
  "delivery_docket",
  "proof_of_completion",
  "pod",
]);

/**
 * @param {unknown} token
 * @returns {string}
 */
function normalizeToken(token) {
  if (typeof token !== "string") return "";
  return token.trim();
}

/**
 * Customer-facing noun per task type. Delivery keeps "order" so existing
 * delivery wording is unchanged; see emails/task-completed.html for parity.
 * @type {Record<string, string>}
 */
const TYPE_NOUNS = {
  Delivery: "order",
  Install: "install",
  Removal: "removal",
  "Site Survey": "site survey",
  Pickup: "pickup",
  Other: "order",
};

/**
 * @param {string} taskType
 */
function nounForType(taskType) {
  return TYPE_NOUNS[taskType] ?? "order";
}

/**
 * @param {string} taskType
 * @param {string} status
 */
function headlineFor(taskType, status) {
  const noun = nounForType(taskType);
  switch (status) {
    case "Completed":
      return taskType === "Delivery"
        ? "Your order has been delivered!"
        : `Your ${noun} is complete!`;
    case "Failed":
      return `Your ${noun} could not be completed`;
    case "Cancelled":
      return `Your ${noun} was cancelled`;
    case "In Progress":
      return `Your ${noun} is in progress`;
    case "Loaded":
      return `Your ${noun} is on the way`;
    case "Assigned":
      return `Your ${noun} has been assigned`;
    default:
      return `Track your ${noun}`;
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
       t.task_type,
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
       AND kind IN ('delivery_docket', 'proof_of_completion', 'pod')`,
    [taskId],
  );

  /** @type {Map<string, string>} */
  const byKind = new Map();
  for (const d of docRows) {
    byKind.set(String(d.kind), String(d.file_name ?? d.kind));
  }

  const taskType = String(row.task_type ?? "");
  const documents = [
    ...(taskType === "Delivery"
      ? [{
      kind: "delivery_docket",
      fileName: byKind.get("delivery_docket") ?? `delivery-docket-${taskId}.pdf`,
      // Docket can be generated on demand.
      available: true,
        }]
      : []),
    {
      kind: "proof_of_completion",
      fileName:
        byKind.get("proof_of_completion") ??
        byKind.get("pod") ??
        `proof-of-completion-${taskId}.pdf`,
      // Generate on demand once the task is complete. Legacy PODs remain usable.
      available:
        String(row.status) === "Completed" ||
        byKind.has("proof_of_completion") ||
        byKind.has("pod"),
    },
  ];

  const history = await getPublicTaskHistory(taskId);
  const status = String(row.status);

  return {
    jobTitle: row.job_title ?? "",
    status,
    taskType,
    headline: headlineFor(taskType, status),
    destinationName: row.destination_name ?? "",
    destinationLabel: taskType === "Delivery" ? "Delivered to" : "Location",
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
 * Resolve public document access context.
 * @param {string} token
 */
async function resolveTaskByToken(token) {
  const publicToken = normalizeToken(token);
  if (!publicToken || publicToken.length > 64) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, task_type, status
     FROM tasks
     WHERE public_token = $1 AND deleted_at IS NULL`,
    [publicToken],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }
  return {
    id: Number(rows[0].id),
    taskType: String(rows[0].task_type),
    status: String(rows[0].status),
  };
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

  const resolvedTask = await resolveTaskByToken(token);
  const taskId = resolvedTask.id;
  const pool = getPool();

  if (docKind === "delivery_docket") {
    if (resolvedTask.taskType !== "Delivery") {
      throw Object.assign(new Error("Not found"), { status: 404 });
    }
    const { rows } = await pool.query(
      `SELECT d.storage_key,
              d.file_name,
              NOT EXISTS (
                SELECT 1
                FROM task_attachments a
                WHERE a.task_id = d.task_id
                  AND lower(a.mime_type) LIKE 'image/%'
                  AND a.created_at > d.generated_at
              ) AS is_current
       FROM task_documents d
       WHERE d.task_id = $1
         AND d.kind = 'delivery_docket'
         AND d.storage_key LIKE $2 || '%'`,
      [taskId, CURRENT_DOCUMENT_STORAGE_PREFIX],
    );
    if (rows[0]?.is_current) {
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

  // Legacy POD links remain valid and serve the stored POD only.
  if (docKind === "pod") {
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

  // Rebuild when a newer image exists so every completion image is included.
  const { rows } = await pool.query(
    `SELECT d.storage_key,
            d.file_name,
            NOT EXISTS (
              SELECT 1
              FROM task_attachments a
              WHERE a.task_id = d.task_id
                AND lower(a.mime_type) LIKE 'image/%'
                AND a.created_at > d.generated_at
            ) AS is_current
     FROM task_documents d
     WHERE d.task_id = $1
       AND d.kind = 'proof_of_completion'
       AND d.storage_key LIKE $2 || '%'`,
    [taskId, CURRENT_DOCUMENT_STORAGE_PREFIX],
  );
  if (rows[0]?.is_current) {
    const buf = await readLocalDocument(String(rows[0].storage_key));
    if (buf) {
      return {
        buffer: buf,
        fileName: String(
          rows[0].file_name || `proof-of-completion-${taskId}.pdf`,
        ),
      };
    }
  }

  const task = await getTask(taskId);
  if (!task) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }
  const { buffer, fileName } = await generateAndStoreProofOfCompletion(task, {
    generatedByUserId: null,
  });
  return { buffer, fileName };
}
