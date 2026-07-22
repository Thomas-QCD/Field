import { getPool } from "./db.mjs";

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
 * @param {unknown} value
 * @returns {number[]}
 */
function asIdList(value) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const raw of value) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw Object.assign(
        new Error("contactIds must be positive integers"),
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
  const externalKey = asNullableString(body.externalKey);
  if (externalKey && externalKey.length > 100) {
    throw Object.assign(new Error("externalKey must be 100 characters or fewer"), {
      status: 400,
    });
  }

  const destinationAddressName = asNullableString(body.destinationAddressName);
  const destinationAddress = asNullableString(body.destinationAddress);
  const destinationBuilding = asNullableString(body.destinationBuilding);
  const destinationNotes = asNullableString(body.destinationNotes);

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

  const crewMemberIds = Array.isArray(body.crewMemberIds)
    ? [...new Set(body.crewMemberIds.map((id) => asString(id)).filter(Boolean))]
    : [];

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
    } else if (destinationAddress || destinationAddressName) {
      if (!destinationAddress) {
        throw Object.assign(
          new Error("destinationAddress is required when creating a new address"),
          { status: 400 },
        );
      }
      const { rows } = await client.query(
        `INSERT INTO addresses (address_name, street_line, building, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          destinationAddressName,
          destinationAddress,
          destinationBuilding,
          destinationNotes,
        ],
      );
      destinationAddressId = Number(rows[0].id);
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
      `INSERT INTO tasks (
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
         window_end_at
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
         $12
       )
       RETURNING id, status, task_type, destination_address_id`,
      [
        taskType,
        status,
        description,
        externalKey,
        createdByUserId,
        destinationAddressId,
        crewSize,
        estimatedHours,
        isTimeSpecific,
        canStartEarly,
        windowStartAt,
        windowEndAt,
      ],
    );

    const taskId = Number(taskRows[0].id);

    for (const contactId of contactIds) {
      await client.query(
        `INSERT INTO task_contacts (task_id, contact_id, is_poc)
         VALUES ($1, $2, $3)`,
        [taskId, contactId, contactId === pocContactId],
      );
    }

    for (const userId of crewMemberIds) {
      await client.query(
        `INSERT INTO task_crew_members (task_id, user_id) VALUES ($1, $2)`,
        [taskId, userId],
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
      contactIds,
      pocContactId,
      crewMemberIds,
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
  const externalKey = asNullableString(body.externalKey);
  if (externalKey && externalKey.length > 100) {
    throw Object.assign(new Error("externalKey must be 100 characters or fewer"), {
      status: 400,
    });
  }

  const destinationAddressName = asNullableString(body.destinationAddressName);
  const destinationAddress = asNullableString(body.destinationAddress);
  const destinationBuilding = asNullableString(body.destinationBuilding);
  const destinationNotes = asNullableString(body.destinationNotes);

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

  const crewMemberIds = Array.isArray(body.crewMemberIds)
    ? [...new Set(body.crewMemberIds.map((id) => asString(id)).filter(Boolean))]
    : [];

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
    } else if (destinationAddress || destinationAddressName) {
      if (!destinationAddress) {
        throw Object.assign(
          new Error("destinationAddress is required when creating a new address"),
          { status: 400 },
        );
      }
      const { rows } = await client.query(
        `INSERT INTO addresses (address_name, street_line, building, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          destinationAddressName,
          destinationAddress,
          destinationBuilding,
          destinationNotes,
        ],
      );
      destinationAddressId = Number(rows[0].id);
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
         external_key = $5,
         destination_address_id = $6,
         crew_size = $7,
         estimated_hours = $8,
         is_time_specific = $9,
         can_start_early = $10,
         window_start_at = $11,
         window_end_at = $12,
         updated_at = now()
       WHERE id = $1
       RETURNING id, status, task_type, destination_address_id`,
      [
        taskId,
        taskType,
        nextStatus,
        description,
        externalKey,
        destinationAddressId,
        crewSize,
        estimatedHours,
        isTimeSpecific,
        canStartEarly,
        windowStartAt,
        windowEndAt,
      ],
    );

    await client.query(`DELETE FROM task_contacts WHERE task_id = $1`, [taskId]);
    for (const contactId of contactIds) {
      await client.query(
        `INSERT INTO task_contacts (task_id, contact_id, is_poc)
         VALUES ($1, $2, $3)`,
        [taskId, contactId, contactId === pocContactId],
      );
    }

    await client.query(`DELETE FROM task_crew_members WHERE task_id = $1`, [
      taskId,
    ]);
    for (const userId of crewMemberIds) {
      await client.query(
        `INSERT INTO task_crew_members (task_id, user_id) VALUES ($1, $2)`,
        [taskId, userId],
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
      crewMemberIds,
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

/** @type {Record<string, string[]>} */
const STATUS_TRANSITIONS = {
  Created: ["Unassigned", "Assigned"],
  Unassigned: ["Assigned"],
  Assigned: ["Loaded", "Arrived", "Failed"],
  Loaded: ["Arrived", "Failed"],
  Arrived: ["Completed", "Failed"],
  Completed: [],
  Failed: [],
  Cancelled: [],
};

/**
 * Update task status with draft transition rules.
 * Start Task → Arrived; End Task → Completed (completed_at set).
 *
 * @param {number} taskId
 * @param {Record<string, unknown>} body
 */
export async function updateTaskStatus(taskId, body) {
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const status = asString(body.status);
  if (!status || !(status in STATUS_TRANSITIONS)) {
    throw Object.assign(new Error(`Invalid status: ${status || "(empty)"}`), {
      status: 400,
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, status
       FROM tasks
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [taskId],
    );
    if (existing.rowCount === 0) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    const fromStatus = existing.rows[0].status;
    if (fromStatus === status) {
      await client.query("COMMIT");
      return { id: taskId, status: fromStatus };
    }

    const allowed = STATUS_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(status)) {
      throw Object.assign(
        new Error(`Cannot change status from ${fromStatus} to ${status}`),
        { status: 409 },
      );
    }

    const { rows } = await client.query(
      `UPDATE tasks
       SET status = $2::task_status,
           completed_at = CASE
             WHEN $2::task_status = 'Completed' THEN COALESCE(completed_at, NOW())
             ELSE completed_at
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
      [taskId, status],
    );

    await client.query("COMMIT");

    return {
      id: Number(rows[0].id),
      status: rows[0].status,
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
