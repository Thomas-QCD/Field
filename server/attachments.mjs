import { getPool } from "./db.mjs";
import {
  buildAttachmentStorageKey,
  deleteObject,
  isValidAttachmentKeyForTask,
  presignGet,
  presignPut,
  sanitizeFileName,
} from "./storage.mjs";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** @type {ReadonlySet<string>} */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

/**
 * @param {string} mimeType
 */
export function kindFromMimeType(mimeType) {
  return mimeType.startsWith("image/") ? "photo" : "document";
}

/**
 * @param {import('pg').QueryResultRow} row
 */
function mapAttachmentRow(row) {
  return {
    id: Number(row.id),
    taskId: Number(row.task_id),
    kind: row.kind,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileName: row.file_name ?? null,
    fileSizeBytes:
      row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    caption: row.caption ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    uploadedByUserId: String(row.uploaded_by_user_id),
    uploadedByName: row.uploaded_by_name ?? null,
  };
}

/**
 * @param {number} taskId
 */
export async function assertTaskExists(taskId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error("Task not found"), { status: 404 });
  }
}

/**
 * @param {number} taskId
 */
export async function listAttachments(taskId) {
  await assertTaskExists(taskId);
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       a.id,
       a.task_id,
       a.kind,
       a.storage_key,
       a.mime_type,
       a.file_name,
       a.file_size_bytes,
       a.caption,
       a.created_at,
       a.uploaded_by_user_id,
       u.display_name AS uploaded_by_name
     FROM task_attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by_user_id
     WHERE a.task_id = $1
     ORDER BY a.created_at ASC, a.id ASC`,
    [taskId],
  );
  return rows.map(mapAttachmentRow);
}

/**
 * @param {number} taskId
 * @param {number} attachmentId
 */
async function getAttachmentRow(taskId, attachmentId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       a.id,
       a.task_id,
       a.kind,
       a.storage_key,
       a.mime_type,
       a.file_name,
       a.file_size_bytes,
       a.caption,
       a.created_at,
       a.uploaded_by_user_id,
       u.display_name AS uploaded_by_name
     FROM task_attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by_user_id
     WHERE a.id = $1 AND a.task_id = $2`,
    [attachmentId, taskId],
  );
  return rows[0] ?? null;
}

/**
 * @param {unknown} body
 */
function requireString(body, key) {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
  const value = /** @type {Record<string, unknown>} */ (body)[key];
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error(`Missing or invalid ${key}`), {
      status: 400,
    });
  }
  return value.trim();
}

/**
 * @param {number} taskId
 * @param {unknown} body
 */
export async function createPresign(taskId, body) {
  await assertTaskExists(taskId);

  const fileName = sanitizeFileName(requireString(body, "fileName"));
  const mimeType = requireString(body, "mimeType").toLowerCase();
  const uploadedByUserId = requireString(body, "uploadedByUserId");

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error(`Unsupported file type: ${mimeType}`), {
      status: 400,
    });
  }

  const rawSize =
    body && typeof body === "object"
      ? /** @type {Record<string, unknown>} */ (body).fileSizeBytes
      : undefined;
  const fileSizeBytes =
    typeof rawSize === "number"
      ? rawSize
      : typeof rawSize === "string"
        ? Number(rawSize)
        : NaN;
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    throw Object.assign(new Error("Missing or invalid fileSizeBytes"), {
      status: 400,
    });
  }
  if (fileSizeBytes > MAX_ATTACHMENT_BYTES) {
    throw Object.assign(
      new Error(`File exceeds ${MAX_ATTACHMENT_BYTES} byte limit`),
      { status: 400 },
    );
  }

  const pool = getPool();
  const userCheck = await pool.query(
    `SELECT id FROM users WHERE id = $1::uuid AND is_active = true`,
    [uploadedByUserId],
  );
  if (userCheck.rows.length === 0) {
    throw Object.assign(new Error("Uploader user not found"), { status: 400 });
  }

  const storageKey = buildAttachmentStorageKey(taskId, fileName);
  const { uploadUrl } = await presignPut({ storageKey, mimeType });

  return {
    uploadUrl,
    storageKey,
    fileName,
    mimeType,
    fileSizeBytes,
    kind: kindFromMimeType(mimeType),
    uploadedByUserId,
  };
}

/**
 * @param {number} taskId
 * @param {unknown} body
 */
export async function confirmAttachment(taskId, body) {
  await assertTaskExists(taskId);

  const storageKey = requireString(body, "storageKey");
  if (!isValidAttachmentKeyForTask(taskId, storageKey)) {
    throw Object.assign(new Error("Invalid storageKey for task"), {
      status: 400,
    });
  }

  const fileName = sanitizeFileName(requireString(body, "fileName"));
  const mimeType = requireString(body, "mimeType").toLowerCase();
  const uploadedByUserId = requireString(body, "uploadedByUserId");

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error(`Unsupported file type: ${mimeType}`), {
      status: 400,
    });
  }

  const rawSize =
    body && typeof body === "object"
      ? /** @type {Record<string, unknown>} */ (body).fileSizeBytes
      : undefined;
  const fileSizeBytes =
    typeof rawSize === "number"
      ? rawSize
      : typeof rawSize === "string"
        ? Number(rawSize)
        : NaN;
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    throw Object.assign(new Error("Missing or invalid fileSizeBytes"), {
      status: 400,
    });
  }
  if (fileSizeBytes > MAX_ATTACHMENT_BYTES) {
    throw Object.assign(
      new Error(`File exceeds ${MAX_ATTACHMENT_BYTES} byte limit`),
      { status: 400 },
    );
  }

  const captionRaw =
    body && typeof body === "object"
      ? /** @type {Record<string, unknown>} */ (body).caption
      : undefined;
  const caption =
    typeof captionRaw === "string" && captionRaw.trim()
      ? captionRaw.trim().slice(0, 2000)
      : null;

  const kind = kindFromMimeType(mimeType);
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `INSERT INTO task_attachments (
         task_id,
         uploaded_by_user_id,
         kind,
         storage_key,
         mime_type,
         file_name,
         file_size_bytes,
         caption
       ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8)
       RETURNING id, task_id, kind, storage_key, mime_type, file_name,
                 file_size_bytes, caption, created_at, uploaded_by_user_id`,
      [
        taskId,
        uploadedByUserId,
        kind,
        storageKey,
        mimeType,
        fileName,
        Math.round(fileSizeBytes),
        caption,
      ],
    );

    const row = rows[0];
    const nameResult = await pool.query(
      `SELECT display_name FROM users WHERE id = $1::uuid`,
      [uploadedByUserId],
    );
    return mapAttachmentRow({
      ...row,
      uploaded_by_name: nameResult.rows[0]?.display_name ?? null,
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String(err.code)
        : "";
    if (code === "23503") {
      throw Object.assign(new Error("Uploader user not found"), {
        status: 400,
      });
    }
    throw err;
  }
}

/**
 * @param {number} taskId
 * @param {number} attachmentId
 * @param {{ inline?: boolean }} [opts]
 */
export async function getAttachmentDownloadUrl(
  taskId,
  attachmentId,
  opts = {},
) {
  const row = await getAttachmentRow(taskId, attachmentId);
  if (!row) {
    throw Object.assign(new Error("Attachment not found"), { status: 404 });
  }
  const { downloadUrl, expiresIn } = await presignGet({
    storageKey: row.storage_key,
    fileName: row.file_name,
    disposition: opts.inline ? "inline" : "attachment",
  });
  return {
    downloadUrl,
    expiresIn,
    attachment: mapAttachmentRow(row),
  };
}

/**
 * @param {number} taskId
 * @param {number} attachmentId
 */
export async function deleteAttachment(taskId, attachmentId) {
  const row = await getAttachmentRow(taskId, attachmentId);
  if (!row) {
    throw Object.assign(new Error("Attachment not found"), { status: 404 });
  }

  const pool = getPool();
  await pool.query(
    `DELETE FROM task_attachments WHERE id = $1 AND task_id = $2`,
    [attachmentId, taskId],
  );

  try {
    await deleteObject(row.storage_key);
  } catch (err) {
    console.error(
      `Failed to delete S3 object ${row.storage_key}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
