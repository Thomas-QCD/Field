import { getPool } from "./db.mjs";
import { recordTaskHistoryEvent } from "./taskHistory.mjs";
import { generatePublicToken } from "./publicToken.mjs";
import { maybeSendTerminalEmails } from "./taskCompletionEmails.mjs";
import { parseEquipment } from "../shared/equipment.js";
import {
  DELIVERY_STATUS_TRANSITIONS,
  STATUS_TRANSITIONS,
  statusTransitionsFor,
} from "../shared/statusTransitions.js";

const TASK_TYPES = new Set([
  "Delivery",
  "Install",
  "Removal",
  "Site Survey",
  "Pickup",
  "Other",
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asNullableString(value) {
  const s = asString(value);
  return s.length > 0 ? s : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function asBool(value) {
  if (typeof value === "boolean") return value;
  return value === "true" || value === true;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asOptionalInt(value) {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asOptionalNumber(value) {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalDateTime(value) {
  const s = asString(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid datetime: ${s}`);
  }
  return d.toISOString();
}

/**
 * Upsert one user's completion/failed notes for a task.
 * @param {import('pg').PoolClient} client
 * @param {number} taskId
 * @param {string} userId
 * @param {'Completed' | 'Failed'} outcome
 * @param {string | null} notes
 */
async function upsertCompletionNote(client, taskId, userId, outcome, notes) {
  await client.query(
    `INSERT INTO task_completion_notes (task_id, user_id, outcome, notes)
     VALUES ($1, $2::uuid, $3, $4)
     ON CONFLICT (task_id, user_id) DO UPDATE
       SET outcome = EXCLUDED.outcome,
           notes = EXCLUDED.notes,
           updated_at = NOW()`,
    [taskId, userId, outcome, notes],
  );
}

/**
 * Rebuild tasks.completed_notes / failed_reason from per-user rows (PDF / API rollup).
 * @param {import('pg').PoolClient} client
 * @param {number} taskId
 */
async function refreshTaskNoteAggregates(client, taskId) {
  const { rows } = await client.query(
    `SELECT n.outcome, n.notes, u.display_name
     FROM task_completion_notes n
     JOIN users u ON u.id = n.user_id
     WHERE n.task_id = $1
     ORDER BY n.created_at ASC, n.id ASC`,
    [taskId],
  );

  /** @type {string[]} */
  const completedParts = [];
  /** @type {string[]} */
  const failedParts = [];
  for (const row of rows) {
    const text = row.notes == null ? "" : String(row.notes);
    if (text.length === 0) continue;
    const line = `${row.display_name}: ${text}`;
    if (row.outcome === "Failed") failedParts.push(line);
    else completedParts.push(line);
  }

  const { rows: updated } = await client.query(
    `UPDATE tasks
     SET completed_notes = $2,
         failed_reason = $3,
         completion_notes_by_user_id = (
           SELECT user_id
           FROM task_completion_notes
           WHERE task_id = $1
           ORDER BY updated_at DESC, id DESC
           LIMIT 1
         ),
         updated_at = NOW()
     WHERE id = $1
     RETURNING completed_notes, failed_reason`,
    [
      taskId,
      completedParts.length > 0 ? completedParts.join("\n\n") : null,
      failedParts.length > 0 ? failedParts.join("\n\n") : null,
    ],
  );

  return {
    completedNotes: updated[0]?.completed_notes ?? null,
    failedReason: updated[0]?.failed_reason ?? null,
  };
}

/**
 * @param {import('pg').PoolClient | import('pg').Pool} db
 * @param {number} taskId
 */
async function listCompletionNotes(db, taskId) {
  const { rows } = await db.query(
    `SELECT
       n.user_id,
       u.display_name,
       n.outcome,
       n.notes,
       n.created_at,
       n.updated_at
     FROM task_completion_notes n
     JOIN users u ON u.id = n.user_id
     WHERE n.task_id = $1
     ORDER BY n.created_at ASC, n.id ASC`,
    [taskId],
  );
  return rows.map((row) => ({
    userId: String(row.user_id),
    displayName: row.display_name ?? "",
    outcome: row.outcome,
    notes: row.notes ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

/**
 * @param {unknown} value
 * @returns {number[]}
 */
function asIdList(value, fieldName = "contactIds") {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const raw of value) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw Object.assign(
        new Error(`${fieldName} must be positive integers`),
        { status: 400 },
      );
    }
    ids.push(n);
  }
  return [...new Set(ids)];
}

/**
 * Resolve the task POC: explicit pocContactId if on the task, else first contact.
 * @param {number[]} contactIds
 * @param {unknown} rawPocContactId
 * @returns {number | null}
 */
function resolvePocContactId(contactIds, rawPocContactId) {
  if (contactIds.length === 0) return null;

  if (rawPocContactId != null && rawPocContactId !== "") {
    const n = Number(rawPocContactId);
    if (!Number.isInteger(n) || n < 1) {
      throw Object.assign(
        new Error("pocContactId must be a positive integer"),
        { status: 400 },
      );
    }
    if (!contactIds.includes(n)) {
      throw Object.assign(
        new Error("pocContactId must be one of contactIds"),
        { status: 400 },
      );
    }
    return n;
  }

  return contactIds[0];
}

/**
 * Resolve the task lead crew member: explicit leadCrewMemberId if on the task,
 * else first crew member. Remaining assigned crew are sub.
 * @param {string[]} crewMemberIds
 * @param {unknown} rawLeadCrewMemberId
 * @returns {string | null}
 */
function resolveLeadCrewMemberId(crewMemberIds, rawLeadCrewMemberId) {
  if (crewMemberIds.length === 0) return null;

  if (rawLeadCrewMemberId != null && rawLeadCrewMemberId !== "") {
    const id = asString(rawLeadCrewMemberId);
    if (!id) {
      throw Object.assign(
        new Error("leadCrewMemberId must be a non-empty string"),
        { status: 400 },
      );
    }
    if (!crewMemberIds.includes(id)) {
      throw Object.assign(
        new Error("leadCrewMemberId must be one of crewMemberIds"),
        { status: 400 },
      );
    }
    return id;
  }

  return crewMemberIds[0];
}

/**
 * Contacts that receive automated task emails.
 * If omitted, POC receives email and others do not.
 * @param {number[]} contactIds
 * @param {number | null} pocContactId
 * @param {unknown} rawReceiveEmailContactIds
 * @returns {Set<number>}
 */
function resolveReceiveEmailContactIds(
  contactIds,
  pocContactId,
  rawReceiveEmailContactIds,
) {
  if (rawReceiveEmailContactIds === undefined) {
    return new Set(pocContactId != null ? [pocContactId] : []);
  }
  const ids = asIdList(rawReceiveEmailContactIds, "receiveEmailContactIds");
  const allowed = new Set(contactIds);
  for (const id of ids) {
    if (!allowed.has(id)) {
      throw Object.assign(
        new Error("receiveEmailContactIds must be a subset of contactIds"),
        { status: 400 },
      );
    }
  }
  return new Set(ids);
}

/**
 * Create a task with 0..many contacts (task_contacts) and optional 0..1 address.
 *
 * @param {Record<string, unknown>} body
 */
export async function createTask(body) {
  const createdByUserId = asString(body.createdByUserId);
  if (!createdByUserId) {
    throw Object.assign(new Error("createdByUserId is required"), {
      status: 400,
    });
  }

  const taskType = asString(body.taskType) || "Delivery";
  if (!TASK_TYPES.has(taskType)) {
    throw Object.assign(new Error(`Invalid taskType: ${taskType}`), {
      status: 400,
    });
  }

  const description = asNullableString(body.taskDesc);
  const jobTitle = asNullableString(body.jobTitle);
  if (jobTitle && jobTitle.length > 255) {
    throw Object.assign(new Error("jobTitle must be 255 characters or fewer"), {
      status: 400,
    });
  }
  const externalKey = asNullableString(body.externalKey);
  if (externalKey && externalKey.length > 100) {
    throw Object.assign(new Error("externalKey must be 100 characters or fewer"), {
      status: 400,
    });
  }

  const rawDestinationAddressId = body.destinationAddressId;
  /** @type {number | null} */
  let destinationAddressId = null;
  if (rawDestinationAddressId != null && rawDestinationAddressId !== "") {
    const n = Number(rawDestinationAddressId);
    if (!Number.isInteger(n) || n < 1) {
      throw Object.assign(
        new Error("destinationAddressId must be a positive integer"),
        { status: 400 },
      );
    }
    destinationAddressId = n;
  }

  const contactIds = asIdList(body.contactIds);
  const pocContactId = resolvePocContactId(contactIds, body.pocContactId);
  const receiveEmailContactIds = resolveReceiveEmailContactIds(
    contactIds,
    pocContactId,
    body.receiveEmailContactIds,
  );

  const windowStartAt = asOptionalDateTime(body.afterDateTime);
  const windowEndAt = asOptionalDateTime(body.beforeDateTime);
  if (
    windowStartAt &&
    windowEndAt &&
    new Date(windowEndAt) < new Date(windowStartAt)
  ) {
    throw Object.assign(
      new Error("Complete Before must be on or after Complete After"),
      { status: 400 },
    );
  }

  const crewSize = asOptionalInt(body.guys);
  const estimatedHours = asOptionalNumber(body.hours);
  const canStartEarly = asBool(body.canStartEarly);
  const isTimeSpecific = asBool(body.isTimeSpecific);
  const isUrgent = asBool(body.isUrgent);
  const equipment = parseEquipment(body.equipment, taskType);

  const crewMemberIds = Array.isArray(body.crewMemberIds)
    ? [...new Set(body.crewMemberIds.map((id) => asString(id)).filter(Boolean))]
    : [];
  const leadCrewMemberId = resolveLeadCrewMemberId(
    crewMemberIds,
    body.leadCrewMemberId,
  );

  const status = crewMemberIds.length > 0 ? "Assigned" : "Unassigned";

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const creator = await client.query(
      `SELECT id FROM users WHERE id = $1 AND is_active = true`,
      [createdByUserId],
    );
    if (creator.rowCount === 0) {
      throw Object.assign(new Error("createdByUserId not found"), {
        status: 400,
      });
    }

    if (contactIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id
         FROM contacts
         WHERE deleted_at IS NULL
           AND id = ANY($1::bigint[])`,
        [contactIds],
      );
      if (rows.length !== contactIds.length) {
        throw Object.assign(
          new Error("One or more contactIds are invalid"),
          { status: 400 },
        );
      }
    }

    if (destinationAddressId != null) {
      const existing = await client.query(
        `SELECT id FROM addresses WHERE id = $1 AND deleted_at IS NULL`,
        [destinationAddressId],
      );
      if (existing.rowCount === 0) {
        throw Object.assign(new Error("destinationAddressId not found"), {
          status: 400,
        });
      }
    }

    if (crewMemberIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id::text AS id
         FROM users
         WHERE is_active = true
           AND id = ANY($1::uuid[])`,
        [crewMemberIds],
      );
      if (rows.length !== crewMemberIds.length) {
        throw Object.assign(
          new Error("One or more crewMemberIds are invalid"),
          { status: 400 },
        );
      }
    }

    const publicToken = generatePublicToken();

    const { rows: taskRows } = await client.query(
      `INSERT INTO tasks (
         task_type,
         status,
         description,
         job_title,
         external_key,
         created_by_user_id,
         destination_address_id,
         crew_size,
         estimated_hours,
         is_time_specific,
         can_start_early,
         is_urgent,
         equipment,
         window_start_at,
         window_end_at,
         public_token
       ) VALUES (
         $1::task_type,
         $2::task_status,
         $3,
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
         $16
       )
       RETURNING id, status, task_type, destination_address_id, public_token`,
      [
        taskType,
        status,
        description,
        jobTitle,
        externalKey,
        createdByUserId,
        destinationAddressId,
        crewSize,
        estimatedHours,
        isTimeSpecific,
        canStartEarly,
        isUrgent,
        equipment,
        windowStartAt,
        windowEndAt,
        publicToken,
      ],
    );

    const taskId = Number(taskRows[0].id);

    for (const contactId of contactIds) {
      await client.query(
        `INSERT INTO task_contacts (task_id, contact_id, is_poc, receives_email)
         VALUES ($1, $2, $3, $4)`,
        [
          taskId,
          contactId,
          contactId === pocContactId,
          receiveEmailContactIds.has(contactId),
        ],
      );
    }

    for (const userId of crewMemberIds) {
      await client.query(
        `INSERT INTO task_crew_members (task_id, user_id, is_lead) VALUES ($1, $2, $3)`,
        [taskId, userId, userId === leadCrewMemberId],
      );
    }

    await client.query("COMMIT");

    return {
      id: taskId,
      status: taskRows[0].status,
      taskType: taskRows[0].task_type,
      destinationAddressId:
        taskRows[0].destination_address_id != null
          ? Number(taskRows[0].destination_address_id)
          : null,
      publicToken: String(taskRows[0].public_token ?? publicToken),
      contactIds,
      pocContactId,
      receiveEmailContactIds: [...receiveEmailContactIds],
      crewMemberIds,
      leadCrewMemberId,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update editable create-form fields on a task (not status/completion/audit).
 *
 * @param {number} taskId
 * @param {Record<string, unknown>} body
 */
export async function updateTask(taskId, body) {
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const taskType = asString(body.taskType) || "Delivery";
  if (!TASK_TYPES.has(taskType)) {
    throw Object.assign(new Error(`Invalid taskType: ${taskType}`), {
      status: 400,
    });
  }

  const description = asNullableString(body.taskDesc);
  const jobTitle = asNullableString(body.jobTitle);
  if (jobTitle && jobTitle.length > 255) {
    throw Object.assign(new Error("jobTitle must be 255 characters or fewer"), {
      status: 400,
    });
  }
  const externalKey = asNullableString(body.externalKey);
  if (externalKey && externalKey.length > 100) {
    throw Object.assign(new Error("externalKey must be 100 characters or fewer"), {
      status: 400,
    });
  }

  const rawDestinationAddressId = body.destinationAddressId;
  /** @type {number | null} */
  let destinationAddressId = null;
  if (rawDestinationAddressId != null && rawDestinationAddressId !== "") {
    const n = Number(rawDestinationAddressId);
    if (!Number.isInteger(n) || n < 1) {
      throw Object.assign(
        new Error("destinationAddressId must be a positive integer"),
        { status: 400 },
      );
    }
    destinationAddressId = n;
  }

  const contactIds = asIdList(body.contactIds);
  const pocContactId = resolvePocContactId(contactIds, body.pocContactId);
  const receiveEmailContactIds = resolveReceiveEmailContactIds(
    contactIds,
    pocContactId,
    body.receiveEmailContactIds,
  );

  const windowStartAt = asOptionalDateTime(body.afterDateTime);
  const windowEndAt = asOptionalDateTime(body.beforeDateTime);
  if (
    windowStartAt &&
    windowEndAt &&
    new Date(windowEndAt) < new Date(windowStartAt)
  ) {
    throw Object.assign(
      new Error("Complete Before must be on or after Complete After"),
      { status: 400 },
    );
  }

  const crewSize = asOptionalInt(body.guys);
  const estimatedHours = asOptionalNumber(body.hours);
  const canStartEarly = asBool(body.canStartEarly);
  const isTimeSpecific = asBool(body.isTimeSpecific);
  const isUrgent = asBool(body.isUrgent);
  const equipment = parseEquipment(body.equipment, taskType);

  const crewMemberIds = Array.isArray(body.crewMemberIds)
    ? [...new Set(body.crewMemberIds.map((id) => asString(id)).filter(Boolean))]
    : [];
  const leadCrewMemberId = resolveLeadCrewMemberId(
    crewMemberIds,
    body.leadCrewMemberId,
  );

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingTask = await client.query(
      `SELECT id, status FROM tasks WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [taskId],
    );
    if (existingTask.rowCount === 0) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    const currentStatus = existingTask.rows[0].status;
    /** @type {string | null} */
    let nextStatus = null;
    if (currentStatus === "Unassigned" || currentStatus === "Assigned") {
      nextStatus = crewMemberIds.length > 0 ? "Assigned" : "Unassigned";
    }

    if (contactIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id
         FROM contacts
         WHERE deleted_at IS NULL
           AND id = ANY($1::bigint[])`,
        [contactIds],
      );
      if (rows.length !== contactIds.length) {
        throw Object.assign(
          new Error("One or more contactIds are invalid"),
          { status: 400 },
        );
      }
    }

    if (destinationAddressId != null) {
      const existing = await client.query(
        `SELECT id FROM addresses WHERE id = $1 AND deleted_at IS NULL`,
        [destinationAddressId],
      );
      if (existing.rowCount === 0) {
        throw Object.assign(new Error("destinationAddressId not found"), {
          status: 400,
        });
      }
    }

    if (crewMemberIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id::text AS id
         FROM users
         WHERE is_active = true
           AND id = ANY($1::uuid[])`,
        [crewMemberIds],
      );
      if (rows.length !== crewMemberIds.length) {
        throw Object.assign(
          new Error("One or more crewMemberIds are invalid"),
          { status: 400 },
        );
      }
    }

    const { rows: taskRows } = await client.query(
      `UPDATE tasks SET
         task_type = $2::task_type,
         status = COALESCE($3::task_status, status),
         description = $4,
         job_title = $5,
         external_key = $6,
         destination_address_id = $7,
         crew_size = $8,
         estimated_hours = $9,
         is_time_specific = $10,
         can_start_early = $11,
         is_urgent = $12,
         equipment = $13,
         window_start_at = $14,
         window_end_at = $15,
         updated_at = now()
       WHERE id = $1
       RETURNING id, status, task_type, destination_address_id`,
      [
        taskId,
        taskType,
        nextStatus,
        description,
        jobTitle,
        externalKey,
        destinationAddressId,
        crewSize,
        estimatedHours,
        isTimeSpecific,
        canStartEarly,
        isUrgent,
        equipment,
        windowStartAt,
        windowEndAt,
      ],
    );

    await client.query(`DELETE FROM task_contacts WHERE task_id = $1`, [taskId]);
    for (const contactId of contactIds) {
      await client.query(
        `INSERT INTO task_contacts (task_id, contact_id, is_poc, receives_email)
         VALUES ($1, $2, $3, $4)`,
        [
          taskId,
          contactId,
          contactId === pocContactId,
          receiveEmailContactIds.has(contactId),
        ],
      );
    }

    await client.query(`DELETE FROM task_crew_members WHERE task_id = $1`, [
      taskId,
    ]);
    for (const userId of crewMemberIds) {
      await client.query(
        `INSERT INTO task_crew_members (task_id, user_id, is_lead) VALUES ($1, $2, $3)`,
        [taskId, userId, userId === leadCrewMemberId],
      );
    }

    await client.query("COMMIT");

    return {
      id: Number(taskRows[0].id),
      status: taskRows[0].status,
      taskType: taskRows[0].task_type,
      destinationAddressId:
        taskRows[0].destination_address_id != null
          ? Number(taskRows[0].destination_address_id)
          : null,
      contactIds,
      pocContactId,
      receiveEmailContactIds: [...receiveEmailContactIds],
      crewMemberIds,
      leadCrewMemberId,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

const TERMINAL_STATUSES = new Set([
  "Completed",
  "Failed",
  "Undetermined",
  "Cancelled",
]);

/**
 * Terminal statuses a crew member can pull back into work by starting again.
 * Undetermined is included because it covers mixed crew outcomes and restored
 * cancelled tasks, both of which still need work done.
 */
const REOPENABLE_STATUSES = new Set(["Completed", "Undetermined"]);

/**
 * Force-end every crew member who has started but not ended this task.
 * Used when cancelling so in-progress crew are booted out.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} taskId
 * @returns {Promise<number>} number of ended events inserted
 */
export async function endOpenCrewStarts(client, taskId) {
  const { rowCount } = await client.query(
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
    [taskId],
  );
  return rowCount ?? 0;
}

/**
 * Log a per-crew start/end event and derive task status:
 * - First Start → In Progress (Delivery → Loaded) unless already at that status / terminal
 * - Start on Completed or Undetermined → reopen to In Progress (Delivery → Loaded);
 *   clears that user's end + note
 * - All starters have Ended → Completed | Failed | Undetermined from per-user outcomes
 *
 * @param {number} taskId
 * @param {Record<string, unknown>} body
 */
export async function createCrewEvent(taskId, body) {
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const userId = asString(body.userId);
  if (!userId) {
    throw Object.assign(new Error("userId is required"), { status: 400 });
  }

  const eventType = asString(body.eventType);
  if (eventType !== "started" && eventType !== "ended") {
    throw Object.assign(
      new Error(`Invalid eventType: ${eventType || "(empty)"}`),
      { status: 400 },
    );
  }

  const latitude = asOptionalNumber(body.latitude);
  const longitude = asOptionalNumber(body.longitude);
  const accuracyMeters = asOptionalNumber(body.accuracyMeters);
  let recordedAt;
  try {
    recordedAt = asOptionalDateTime(body.recordedAt) ?? new Date().toISOString();
  } catch (err) {
    throw Object.assign(
      err instanceof Error ? err : new Error(String(err)),
      { status: 400 },
    );
  }

  if (latitude == null || longitude == null) {
    throw Object.assign(
      new Error("latitude and longitude are required"),
      { status: 400 },
    );
  }
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw Object.assign(new Error("Invalid latitude/longitude"), {
      status: 400,
    });
  }

  /** @type {'Completed' | 'Failed'} */
  let outcome = "Completed";
  let notes = "";
  if (eventType === "ended") {
    const rawOutcome = asString(body.outcome);
    if (rawOutcome && rawOutcome !== "Completed" && rawOutcome !== "Failed") {
      throw Object.assign(
        new Error(`Invalid outcome: ${rawOutcome}`),
        { status: 400 },
      );
    }
    outcome = rawOutcome === "Failed" ? "Failed" : "Completed";
    notes = body.notes == null ? "" : String(body.notes);
    if (outcome === "Failed" && notes.length === 0) {
      throw Object.assign(new Error("Failed reason is required"), {
        status: 400,
      });
    }
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, status, task_type, completed_at, completed_notes, failed_reason
       FROM tasks
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [taskId],
    );
    if (existing.rowCount === 0) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    const fromStatus = existing.rows[0].status;
    const taskType = String(existing.rows[0].task_type);
    /** Delivery Load Items → Loaded; other types Start → In Progress. */
    const startStatus = taskType === "Delivery" ? "Loaded" : "In Progress";
    const reopening =
      REOPENABLE_STATUSES.has(fromStatus) && eventType === "started";

    if (TERMINAL_STATUSES.has(fromStatus) && !reopening) {
      throw Object.assign(
        new Error(`Cannot log crew event on ${fromStatus} task`),
        { status: 409 },
      );
    }

    const assigned = await client.query(
      `SELECT 1 FROM task_crew_members WHERE task_id = $1 AND user_id = $2`,
      [taskId, userId],
    );
    if (assigned.rowCount === 0) {
      throw Object.assign(
        new Error("User is not assigned to this task"),
        { status: 403 },
      );
    }

    let completedNotes = existing.rows[0].completed_notes ?? null;
    let failedReason = existing.rows[0].failed_reason ?? null;

    if (reopening) {
      // Clear this user's prior end so they can work and end again.
      await client.query(
        `DELETE FROM task_crew_events
         WHERE task_id = $1 AND user_id = $2 AND event_type = 'ended'`,
        [taskId, userId],
      );
      await client.query(
        `DELETE FROM task_completion_notes
         WHERE task_id = $1 AND user_id = $2::uuid`,
        [taskId, userId],
      );
      const aggregates = await refreshTaskNoteAggregates(client, taskId);
      completedNotes = aggregates.completedNotes;
      failedReason = aggregates.failedReason;
    }

    if (eventType === "ended") {
      const started = await client.query(
        `SELECT 1 FROM task_crew_events
         WHERE task_id = $1 AND user_id = $2 AND event_type = 'started'`,
        [taskId, userId],
      );
      if (started.rowCount === 0) {
        throw Object.assign(
          new Error("Cannot end task before starting"),
          { status: 409 },
        );
      }
    }

    let eventRow;
    if (reopening) {
      const priorStarted = await client.query(
        `SELECT id
         FROM task_crew_events
         WHERE task_id = $1 AND user_id = $2 AND event_type = 'started'`,
        [taskId, userId],
      );
      if (priorStarted.rowCount > 0) {
        const updated = await client.query(
          `UPDATE task_crew_events
           SET latitude = $3,
               longitude = $4,
               accuracy_meters = $5,
               recorded_at = $6::timestamptz
           WHERE task_id = $1 AND user_id = $2 AND event_type = 'started'
           RETURNING
             id, task_id, user_id, event_type,
             latitude, longitude, accuracy_meters,
             recorded_at, created_at`,
          [
            taskId,
            userId,
            latitude,
            longitude,
            accuracyMeters,
            recordedAt,
          ],
        );
        eventRow = updated.rows[0];
      }
    }

    if (!eventRow) {
      try {
        const inserted = await client.query(
          `INSERT INTO task_crew_events (
             task_id, user_id, event_type,
             latitude, longitude, accuracy_meters, recorded_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
           RETURNING
             id, task_id, user_id, event_type,
             latitude, longitude, accuracy_meters,
             recorded_at, created_at`,
          [
            taskId,
            userId,
            eventType,
            latitude,
            longitude,
            accuracyMeters,
            recordedAt,
          ],
        );
        eventRow = inserted.rows[0];
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") {
          throw Object.assign(
            new Error(
              eventType === "started"
                ? "Already started this task"
                : "Already ended this task",
            ),
            { status: 409 },
          );
        }
        throw err;
      }
    }

    let nextStatus = fromStatus;
    let completedAt = existing.rows[0].completed_at
      ? new Date(existing.rows[0].completed_at).toISOString()
      : null;

    if (eventType === "started") {
      if (reopening) {
        nextStatus = startStatus;
        completedAt = null;
        await client.query(
          `UPDATE tasks
           SET status = $2::task_status,
               completed_at = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [taskId, startStatus],
        );
      } else if (
        fromStatus !== startStatus &&
        !TERMINAL_STATUSES.has(fromStatus)
      ) {
        nextStatus = startStatus;
        await client.query(
          `UPDATE tasks
           SET status = $2::task_status,
               updated_at = NOW()
           WHERE id = $1`,
          [taskId, startStatus],
        );
      }
    } else {
      // Per-user end outcome — does not terminalize the task until all starters have ended.
      const notesValue = notes.length > 0 ? notes : null;
      await upsertCompletionNote(client, taskId, userId, outcome, notesValue);
      const aggregates = await refreshTaskNoteAggregates(client, taskId);
      completedNotes = aggregates.completedNotes;
      failedReason = aggregates.failedReason;

      const counts = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'started')::int AS started_count,
           COUNT(*) FILTER (WHERE event_type = 'ended')::int AS ended_count
         FROM task_crew_events
         WHERE task_id = $1`,
        [taskId],
      );
      const startedCount = counts.rows[0].started_count;
      const endedCount = counts.rows[0].ended_count;
      if (
        startedCount > 0 &&
        startedCount === endedCount &&
        !TERMINAL_STATUSES.has(fromStatus)
      ) {
        const outcomeRows = await client.query(
          `SELECT n.outcome
           FROM task_crew_events e
           LEFT JOIN task_completion_notes n
             ON n.task_id = e.task_id AND n.user_id = e.user_id
           WHERE e.task_id = $1 AND e.event_type = 'ended'`,
          [taskId],
        );
        let hasFailed = false;
        let hasCompleted = false;
        for (const row of outcomeRows.rows) {
          if (row.outcome === "Failed") hasFailed = true;
          else hasCompleted = true; // null / Completed → treat as Completed
        }

        /** @type {'Completed' | 'Failed' | 'Undetermined'} */
        let resolved = "Completed";
        if (hasFailed && hasCompleted) resolved = "Undetermined";
        else if (hasFailed) resolved = "Failed";

        const updated = await client.query(
          `UPDATE tasks
           SET status = $2::task_status,
               completed_at = COALESCE(completed_at, NOW()),
               updated_at = NOW()
           WHERE id = $1
           RETURNING completed_at`,
          [taskId, resolved],
        );
        nextStatus = resolved;
        completedAt = new Date(updated.rows[0].completed_at).toISOString();
      }
    }

    if (nextStatus !== fromStatus) {
      await recordTaskHistoryEvent(client, {
        taskId,
        eventType: "status_changed",
        actorUserId: userId,
        fromStatus,
        toStatus: nextStatus,
        summary: `Status changed via crew ${eventType}`,
        recordedAt,
      });
    }

    await client.query("COMMIT");

    if (nextStatus !== fromStatus) {
      await maybeSendTerminalEmails(taskId, {
        fromStatus,
        toStatus: nextStatus,
      });
    }

    const completionNotes = await listCompletionNotes(getPool(), taskId);

    return {
      event: {
        id: Number(eventRow.id),
        taskId: Number(eventRow.task_id),
        userId: String(eventRow.user_id),
        eventType: eventRow.event_type,
        latitude:
          eventRow.latitude != null ? Number(eventRow.latitude) : null,
        longitude:
          eventRow.longitude != null ? Number(eventRow.longitude) : null,
        accuracyMeters:
          eventRow.accuracy_meters != null
            ? Number(eventRow.accuracy_meters)
            : null,
        recordedAt: new Date(eventRow.recorded_at).toISOString(),
        createdAt: new Date(eventRow.created_at).toISOString(),
      },
      task: {
        id: taskId,
        status: nextStatus,
        completedAt,
        completedNotes,
        failedReason,
        completionNotes,
      },
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update task status with draft transition rules (admin / manual).
 * Crew Start/End use createCrewEvent instead.
 *
 * @param {number} taskId
 * @param {Record<string, unknown>} body
 */
export async function updateTaskStatus(taskId, body) {
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const status = asString(body.status);
  if (
    !status ||
    (!(status in STATUS_TRANSITIONS) &&
      !(status in DELIVERY_STATUS_TRANSITIONS))
  ) {
    throw Object.assign(new Error(`Invalid status: ${status || "(empty)"}`), {
      status: 400,
    });
  }

  const notesProvided = Object.prototype.hasOwnProperty.call(body, "notes");
  const notes = notesProvided
    ? (body.notes == null ? "" : String(body.notes))
    : null;
  const notesValue = notes != null && notes.length > 0 ? notes : null;
  const authorUserId = asString(body.userId) || null;

  if (status === "Failed" && notesValue == null) {
    throw Object.assign(new Error("Failed reason is required"), {
      status: 400,
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, status, task_type, completed_at, completed_notes, failed_reason
       FROM tasks
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [taskId],
    );
    if (existing.rowCount === 0) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    const fromStatus = existing.rows[0].status;
    const taskType = String(existing.rows[0].task_type);
    let completedNotes = existing.rows[0].completed_notes ?? null;
    let failedReason = existing.rows[0].failed_reason ?? null;
    let completedAt = existing.rows[0].completed_at
      ? new Date(existing.rows[0].completed_at).toISOString()
      : null;

    if (fromStatus === status) {
      if (
        notesProvided &&
        (status === "Completed" || status === "Failed") &&
        authorUserId
      ) {
        await upsertCompletionNote(
          client,
          taskId,
          authorUserId,
          status,
          notesValue,
        );
        const aggregates = await refreshTaskNoteAggregates(client, taskId);
        completedNotes = aggregates.completedNotes;
        failedReason = aggregates.failedReason;
      }
      await client.query("COMMIT");
      const completionNotes = await listCompletionNotes(pool, taskId);
      return {
        id: taskId,
        status: fromStatus,
        completedAt,
        completedNotes,
        failedReason,
        completionNotes,
        completionNotesByName:
          completionNotes.length > 0
            ? completionNotes.map((n) => n.displayName).join(", ")
            : null,
      };
    }

    const allowed = statusTransitionsFor(taskType)[fromStatus] ?? [];
    if (!allowed.includes(status)) {
      throw Object.assign(
        new Error(`Cannot change status from ${fromStatus} to ${status}`),
        { status: 409 },
      );
    }

    if (
      notesProvided &&
      (status === "Completed" || status === "Failed") &&
      authorUserId
    ) {
      await upsertCompletionNote(
        client,
        taskId,
        authorUserId,
        status,
        notesValue,
      );
      const aggregates = await refreshTaskNoteAggregates(client, taskId);
      completedNotes = aggregates.completedNotes;
      failedReason = aggregates.failedReason;
    }

    let rows;
    if (status === "Completed") {
      ({ rows } = await client.query(
        `UPDATE tasks
         SET status = 'Completed'::task_status,
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, completed_at, completed_notes, failed_reason`,
        [taskId],
      ));
    } else if (status === "Failed" || status === "Undetermined") {
      ({ rows } = await client.query(
        `UPDATE tasks
         SET status = $2::task_status,
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, completed_at, completed_notes, failed_reason`,
        [taskId, status],
      ));
    } else if (status === "Cancelled") {
      ({ rows } = await client.query(
        `UPDATE tasks
         SET status_before_cancel = CASE
               WHEN status = 'Cancelled'::task_status THEN status_before_cancel
               ELSE status
             END,
             cancelled_at = CASE
               WHEN status = 'Cancelled'::task_status THEN cancelled_at
               ELSE NOW()
             END,
             status = 'Cancelled'::task_status,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, completed_at, completed_notes, failed_reason`,
        [taskId],
      ));
    } else if (status === "In Progress" || status === "Loaded") {
      ({ rows } = await client.query(
        `UPDATE tasks
         SET status = $2::task_status,
             completed_at = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, completed_at, completed_notes, failed_reason`,
        [taskId, status],
      ));
    } else {
      ({ rows } = await client.query(
        `UPDATE tasks
         SET status = $2::task_status,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, completed_at, completed_notes, failed_reason`,
        [taskId, status],
      ));
    }

    await recordTaskHistoryEvent(client, {
      taskId,
      eventType: "status_changed",
      actorUserId: authorUserId,
      fromStatus,
      toStatus: status,
      summary: notesValue,
    });

    await client.query("COMMIT");

    await maybeSendTerminalEmails(taskId, {
      fromStatus,
      toStatus: status,
    });

    const completionNotes = await listCompletionNotes(pool, taskId);

    return {
      id: Number(rows[0].id),
      status: rows[0].status,
      completedAt: rows[0].completed_at
        ? new Date(rows[0].completed_at).toISOString()
        : null,
      completedNotes: rows[0].completed_notes ?? completedNotes,
      failedReason: rows[0].failed_reason ?? failedReason,
      completionNotes,
      completionNotesByName:
        completionNotes.length > 0
          ? completionNotes.map((n) => n.displayName).join(", ")
          : null,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

export { listCompletionNotes };
