import { randomBytes } from "node:crypto";

export const WODELY_SYNC_USER_ID = "a0000000-0000-4000-8000-000000000001";

const FIELD_STATUSES = new Set([
  "Unassigned",
  "Assigned",
  "Loaded",
  "In Progress",
  "Completed",
  "Failed",
  "Undetermined",
  "Cancelled",
]);

/** @returns {string} */
function generatePublicToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * @param {Record<string, unknown>} obj
 * @param {...string} keys
 */
function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * @param {unknown} value
 */
function asString(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} value
 */
function asNullableString(value) {
  const s = asString(value);
  return s.length > 0 ? s : null;
}

/**
 * Normalize webhook (PascalCase) or API (camelCase) Wodely task payloads.
 * @param {Record<string, unknown>} raw
 */
export function normalizeWodelyTask(raw) {
  const idRaw = pick(raw, "Id", "id");
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw);

  return {
    id,
    typeDesc: asString(pick(raw, "TypeDesc", "typeDesc", "TaskType", "taskType")),
    statusDesc: asString(
      pick(raw, "StatusDesc", "statusDesc", "Status", "status"),
    ),
    taskDesc: asNullableString(pick(raw, "TaskDesc", "taskDesc", "description")),
    externalKey: asNullableString(pick(raw, "ExternalKey", "externalKey")),
    assignedToDriverUserId: asNullableString(
      pick(raw, "AssignedToDriverUserId", "assignedToDriverUserId"),
    ),
    createdDateTime: asNullableString(
      pick(raw, "CreatedDateTime", "createdDateTime"),
    ),
    modifiedDateTime: asNullableString(
      pick(raw, "ModifiedDateTime", "modifiedDateTime"),
    ),
    afterDateTime: asNullableString(
      pick(raw, "AfterDateTime", "afterDateTime"),
    ),
    beforeDateTime: asNullableString(
      pick(raw, "BeforeDateTime", "beforeDateTime"),
    ),
    destinationAddress: asNullableString(
      pick(raw, "DestinationAddress", "destinationAddress"),
    ),
    destinationBuilding: asNullableString(
      pick(raw, "DestinationBuilding", "destinationBuilding"),
    ),
    destinationCoordinates: asNullableString(
      pick(raw, "DestinationCoordinates", "destinationCoordinates"),
    ),
    destinationNotes: asNullableString(
      pick(raw, "DestinationNotes", "destinationNotes"),
    ),
    recipientName: asNullableString(
      pick(raw, "RecipientName", "recipientName"),
    ),
    completedNotes: asNullableString(
      pick(raw, "CompletedNotes", "completedNotes"),
    ),
    completedDateTime: asNullableString(
      pick(raw, "CompletedDateTime", "completedDateTime"),
    ),
    taskFailedReason: asNullableString(
      pick(raw, "TaskFailedReason", "taskFailedReason"),
    ),
    tag1: asNullableString(pick(raw, "Tag1", "tag1")),
    isTimeSpecific: Boolean(
      pick(raw, "IsTimeSpecific", "isTimeSpecific") ?? false,
    ),
    canStartEarly: Boolean(
      pick(raw, "CanInstallEarly", "canInstallEarly", "canStartEarly") ?? false,
    ),
    guys: pick(raw, "Guys", "guys"),
    hours: pick(raw, "Hours", "hours"),
  };
}

/**
 * @param {string} typeDesc
 */
export function mapTaskType(typeDesc) {
  switch (typeDesc) {
    case "Delivery":
      return "Delivery";
    case "Pickup":
      return "Pickup";
    case "Field Workforce":
      return "Install";
    case "Install":
      return "Install";
    case "Removal":
      return "Removal";
    case "Site Survey":
      return "Site Survey";
    case "Appointment":
      return "Other";
    default:
      return "Other";
  }
}

/**
 * @param {string} statusDesc
 * @param {string | null | undefined} webhookState
 */
export function mapTaskStatus(statusDesc, webhookState) {
  if (webhookState === "Cancelled") return "Cancelled";
  if (statusDesc === "Transit") return "Loaded";
  if (statusDesc === "Arrived") return "In Progress";
  if (statusDesc === "Created") return "Unassigned";
  if (FIELD_STATUSES.has(statusDesc)) return statusDesc;
  if (webhookState === "Completed") return "Completed";
  if (webhookState === "Failed") return "Failed";
  if (webhookState === "Driver arrived") return "In Progress";
  if (webhookState === "Package loaded/picked up") return "Loaded";
  if (webhookState === "Driver assigned") return "Assigned";
  if (webhookState === "Created") return "Unassigned";
  return "Unassigned";
}

/**
 * @param {unknown} value
 */
function normalizeUtcIso(value) {
  const s = asString(value);
  if (!s) return null;
  const normalized =
    s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * @param {string | null} coords
 * @returns {{ lat: number | null, lng: number | null }}
 */
function parseCoords(coords) {
  if (!coords) return { lat: null, lng: null };
  const parts = coords.split(",").map((p) => p.trim());
  if (parts.length !== 2) return { lat: null, lng: null };
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { lat: null, lng: null };
  }
  return { lat, lng };
}

/**
 * @param {unknown} value
 */
function asOptionalInt(value) {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * @param {unknown} value
 */
function asOptionalNumber(value) {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Upsert a Wodely task into Field Postgres.
 *
 * @param {Record<string, unknown>} raw
 * @param {{ webhookState?: string | null, pool?: import("pg").Pool }} [options]
 */
export async function persistFieldTask(raw, options = {}) {
  const task = normalizeWodelyTask(raw);
  if (!Number.isInteger(task.id) || task.id < 1) {
    throw new Error(`Invalid Wodely task id: ${task.id}`);
  }

  const webhookState = options.webhookState ?? null;
  const taskType = mapTaskType(task.typeDesc);
  const status = mapTaskStatus(task.statusDesc, webhookState);
  const externalKey =
    task.externalKey && task.externalKey !== "N/A" ? task.externalKey : null;
  const modifiedAt = normalizeUtcIso(task.modifiedDateTime);
  const createdAt = normalizeUtcIso(task.createdDateTime) ?? modifiedAt;
  const windowStartAt = normalizeUtcIso(task.afterDateTime);
  const windowEndAt = normalizeUtcIso(task.beforeDateTime);
  const completedAt = normalizeUtcIso(task.completedDateTime);
  const { lat, lng } = parseCoords(task.destinationCoordinates);
  const crewSize = asOptionalInt(task.guys);
  const estimatedHours = asOptionalNumber(task.hours);

  const pool =
    options.pool ?? (await (await import("./db.mjs")).getPool());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, status, updated_at, created_by_user_id
       FROM tasks
       WHERE id = $1
       FOR UPDATE`,
      [task.id],
    );

    if (existing.rowCount > 0 && modifiedAt) {
      const storedUpdated = new Date(existing.rows[0].updated_at).getTime();
      const incoming = new Date(modifiedAt).getTime();
      if (storedUpdated > incoming) {
        await client.query("ROLLBACK");
        console.log("PG_SKIP_STALE", { id: task.id });
        return { skipped: true, id: task.id };
      }
    }

    let createdByUserId =
      existing.rowCount > 0 ? existing.rows[0].created_by_user_id : null;

    if (!createdByUserId && task.tag1) {
      const byName = await client.query(
        `SELECT id
         FROM users
         WHERE lower(display_name) = lower($1)
           AND is_active = true
         ORDER BY created_at
         LIMIT 1`,
        [task.tag1],
      );
      if (byName.rowCount > 0) {
        createdByUserId = byName.rows[0].id;
      }
    }

    if (!createdByUserId) {
      createdByUserId = WODELY_SYNC_USER_ID;
      await client.query(
        `INSERT INTO users (id, display_name, role, is_active)
         VALUES ($1, 'Wodely Sync', 'admin', true)
         ON CONFLICT (id) DO NOTHING`,
        [WODELY_SYNC_USER_ID],
      );
    }

    /** @type {number | null} */
    let destinationAddressId = null;
    if (task.destinationAddress) {
      const addressName = task.recipientName;
      const match = await client.query(
        `SELECT id
         FROM addresses
         WHERE street_line = $1
           AND (
             ($2::text IS NULL AND address_name IS NULL)
             OR address_name = $2
           )
         ORDER BY id
         LIMIT 1`,
        [task.destinationAddress, addressName],
      );

      if (match.rowCount > 0) {
        destinationAddressId = Number(match.rows[0].id);
        await client.query(
          `UPDATE addresses
           SET building = COALESCE($2, building),
               notes = COALESCE($3, notes),
               latitude = COALESCE($4, latitude),
               longitude = COALESCE($5, longitude),
               address_name = COALESCE($6, address_name)
           WHERE id = $1`,
          [
            destinationAddressId,
            task.destinationBuilding,
            task.destinationNotes,
            lat,
            lng,
            addressName,
          ],
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO addresses (
             address_name, street_line, building, notes, latitude, longitude
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            addressName,
            task.destinationAddress,
            task.destinationBuilding,
            task.destinationNotes,
            lat,
            lng,
          ],
        );
        destinationAddressId = Number(inserted.rows[0].id);
      }
    }

    let windowStart = windowStartAt;
    let windowEnd = windowEndAt;
    if (windowStart && windowEnd && new Date(windowEnd) < new Date(windowStart)) {
      windowEnd = windowStart;
    }

    await client.query(
      `INSERT INTO tasks (
         id,
         task_type,
         status,
         description,
         external_key,
         created_by_user_id,
         destination_address_id,
         crew_size,
         estimated_hours,
         is_time_specific,
         can_start_early,
         window_start_at,
         window_end_at,
         completed_notes,
         completed_at,
         failed_reason,
         created_at,
         updated_at,
         public_token
       ) VALUES (
         $1,
         $2::task_type,
         $3::task_status,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13,
         $14,
         $15,
         $16,
         COALESCE($17::timestamptz, now()),
         COALESCE($18::timestamptz, now()),
         $19
       )
       ON CONFLICT (id) DO UPDATE SET
         task_type = EXCLUDED.task_type,
         status = EXCLUDED.status,
         description = EXCLUDED.description,
         external_key = EXCLUDED.external_key,
         destination_address_id = EXCLUDED.destination_address_id,
         crew_size = EXCLUDED.crew_size,
         estimated_hours = EXCLUDED.estimated_hours,
         is_time_specific = EXCLUDED.is_time_specific,
         can_start_early = EXCLUDED.can_start_early,
         window_start_at = EXCLUDED.window_start_at,
         window_end_at = EXCLUDED.window_end_at,
         completed_notes = EXCLUDED.completed_notes,
         completed_at = EXCLUDED.completed_at,
         failed_reason = EXCLUDED.failed_reason,
         updated_at = COALESCE(EXCLUDED.updated_at, now())`,
      [
        task.id,
        taskType,
        status,
        task.taskDesc,
        externalKey && externalKey.length > 100
          ? externalKey.slice(0, 100)
          : externalKey,
        createdByUserId,
        destinationAddressId,
        crewSize,
        estimatedHours,
        task.isTimeSpecific,
        task.canStartEarly,
        windowStart,
        windowEnd,
        task.completedNotes,
        completedAt,
        task.taskFailedReason,
        createdAt,
        modifiedAt,
        generatePublicToken(),
      ],
    );

    const priorStatus =
      existing.rowCount > 0 ? existing.rows[0].status : null;
    if (status === "Cancelled") {
      if (priorStatus !== "Cancelled") {
        await client.query(
          `INSERT INTO task_crew_events (task_id, user_id, event_type, recorded_at)
           SELECT s.task_id, s.user_id, 'ended', now()
           FROM task_crew_events s
           WHERE s.task_id = $1
             AND s.event_type = 'started'
             AND NOT EXISTS (
               SELECT 1
               FROM task_crew_events e
               WHERE e.task_id = s.task_id
                 AND e.user_id = s.user_id
                 AND e.event_type = 'ended'
             )
           ON CONFLICT (task_id, user_id, event_type) DO NOTHING`,
          [task.id],
        );
        await client.query(
          `UPDATE tasks
           SET cancelled_at = COALESCE($2::timestamptz, now()),
               status_before_cancel = $3::task_status
           WHERE id = $1`,
          [
            task.id,
            modifiedAt,
            priorStatus && priorStatus !== "Cancelled" ? priorStatus : null,
          ],
        );
      }
    } else if (priorStatus === "Cancelled") {
      await client.query(
        `UPDATE tasks
         SET cancelled_at = NULL,
             status_before_cancel = NULL
         WHERE id = $1`,
        [task.id],
      );
    }

    await client.query(`DELETE FROM task_crew_members WHERE task_id = $1`, [
      task.id,
    ]);

    if (task.assignedToDriverUserId) {
      const crew = await client.query(
        `SELECT id FROM users WHERE id = $1 AND is_active = true`,
        [task.assignedToDriverUserId],
      );
      if (crew.rowCount > 0) {
        await client.query(
          `INSERT INTO task_crew_members (task_id, user_id) VALUES ($1, $2)`,
          [task.id, task.assignedToDriverUserId],
        );
      } else {
        console.log("PG_CREW_UNKNOWN", {
          id: task.id,
          userId: task.assignedToDriverUserId,
        });
      }
    }

    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('tasks', 'id'),
         GREATEST((SELECT COALESCE(MAX(id), 1) FROM tasks), 1)
       )`,
    );

    await client.query("COMMIT");
    console.log("PG_UPSERT", { id: task.id, taskType, status });
    return { skipped: false, id: task.id, taskType, status };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
