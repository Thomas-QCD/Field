/**
 * Task history: append status/audit events + aggregate a timeline for the UI.
 */
import { getPool } from "./db.mjs";

/**
 * @param {import("pg").PoolClient | import("pg").Pool} db
 * @param {{
 *   taskId: number,
 *   eventType: string,
 *   actorUserId?: string | null,
 *   fromStatus?: string | null,
 *   toStatus?: string | null,
 *   summary?: string | null,
 *   recordedAt?: string | null,
 * }} input
 */
export async function recordTaskHistoryEvent(db, input) {
  const taskId = Number(input.taskId);
  if (!Number.isInteger(taskId) || taskId < 1) return null;

  const eventType =
    typeof input.eventType === "string" ? input.eventType.trim() : "";
  if (!eventType) return null;

  const actorUserId =
    typeof input.actorUserId === "string" && input.actorUserId.trim()
      ? input.actorUserId.trim()
      : null;
  const fromStatus =
    typeof input.fromStatus === "string" && input.fromStatus.trim()
      ? input.fromStatus.trim()
      : null;
  const toStatus =
    typeof input.toStatus === "string" && input.toStatus.trim()
      ? input.toStatus.trim()
      : null;
  const summary =
    typeof input.summary === "string" && input.summary.trim()
      ? input.summary.trim()
      : null;
  const recordedAt =
    typeof input.recordedAt === "string" && input.recordedAt.trim()
      ? input.recordedAt.trim()
      : null;

  const { rows } = await db.query(
    `INSERT INTO task_history_events (
       task_id, event_type, actor_user_id, from_status, to_status, summary, recorded_at
     ) VALUES (
       $1, $2, $3::uuid, $4::task_status, $5::task_status, $6,
       COALESCE($7::timestamptz, now())
     )
     RETURNING id`,
    [taskId, eventType, actorUserId, fromStatus, toStatus, summary, recordedAt],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function isoOrNull(value) {
  if (value == null) return null;
  const d = new Date(/** @type {string | Date} */ (value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {number} n
 * @returns {number | null}
 */
function numOrNull(n) {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/**
 * Build a chronological history timeline for a task.
 * @param {number} taskId
 */
export async function getTaskHistory(taskId) {
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const pool = getPool();

  const exists = await pool.query(
    `SELECT 1 FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );
  if (exists.rowCount === 0) {
    throw Object.assign(new Error("Task not found"), { status: 404 });
  }

  const { rows } = await pool.query(
    `
    SELECT * FROM (
      -- Task created
      SELECT
        'created:' || t.id::text AS id,
        'created'::text AS event_type,
        t.created_at AS recorded_at,
        cu.display_name AS actor_name,
        NULL::text AS from_status,
        NULL::text AS to_status,
        NULL::text AS summary,
        NULL::text AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM tasks t
      LEFT JOIN users cu ON cu.id = t.created_by_user_id
      WHERE t.id = $1

      UNION ALL

      -- Logged status / restore events
      SELECT
        'history:' || h.id::text AS id,
        h.event_type,
        h.recorded_at,
        u.display_name AS actor_name,
        h.from_status::text,
        h.to_status::text,
        h.summary,
        NULL::text AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM task_history_events h
      LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.task_id = $1

      UNION ALL

      -- Crew start / end (source of truth)
      SELECT
        'crew:' || e.id::text AS id,
        CASE e.event_type
          WHEN 'started' THEN 'crew_started'
          ELSE 'crew_ended'
        END AS event_type,
        e.recorded_at,
        u.display_name AS actor_name,
        NULL::text AS from_status,
        NULL::text AS to_status,
        NULL::text AS summary,
        CASE
          WHEN e.latitude IS NOT NULL AND e.longitude IS NOT NULL
            THEN 'GPS ' || round(e.latitude::numeric, 5)::text
              || ', ' || round(e.longitude::numeric, 5)::text
              || CASE
                   WHEN e.accuracy_meters IS NOT NULL
                     THEN ' (±' || round(e.accuracy_meters::numeric, 0)::text || ' m)'
                   ELSE ''
                 END
          ELSE NULL
        END AS detail,
        e.latitude,
        e.longitude,
        e.accuracy_meters
      FROM task_crew_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.task_id = $1

      UNION ALL

      -- Completion / failure notes
      SELECT
        'note:' || n.task_id::text || ':' || n.user_id::text AS id,
        'note_added'::text AS event_type,
        COALESCE(n.updated_at, n.created_at) AS recorded_at,
        u.display_name AS actor_name,
        NULL::text AS from_status,
        n.outcome::text AS to_status,
        NULLIF(trim(n.notes), '') AS summary,
        NULL::text AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM task_completion_notes n
      LEFT JOIN users u ON u.id = n.user_id
      WHERE n.task_id = $1

      UNION ALL

      -- Attachments
      SELECT
        'attachment:' || a.id::text AS id,
        'attachment_added'::text AS event_type,
        a.created_at AS recorded_at,
        u.display_name AS actor_name,
        NULL::text AS from_status,
        NULL::text AS to_status,
        COALESCE(NULLIF(trim(a.file_name), ''), initcap(a.kind)) AS summary,
        a.kind AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM task_attachments a
      LEFT JOIN users u ON u.id = a.uploaded_by_user_id
      WHERE a.task_id = $1

      UNION ALL

      -- Generated PDFs
      SELECT
        'document:' || d.id::text AS id,
        'document_generated'::text AS event_type,
        d.generated_at AS recorded_at,
        u.display_name AS actor_name,
        NULL::text AS from_status,
        NULL::text AS to_status,
        COALESCE(NULLIF(trim(d.file_name), ''), replace(d.kind, '_', ' ')) AS summary,
        d.kind AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM task_documents d
      LEFT JOIN users u ON u.id = d.generated_by_user_id
      WHERE d.task_id = $1

      UNION ALL

      -- Outbound emails
      SELECT
        'email:' || ed.id::text AS id,
        'email_sent'::text AS event_type,
        COALESCE(ed.sent_at, ed.created_at) AS recorded_at,
        NULL::text AS actor_name,
        NULL::text AS from_status,
        NULL::text AS to_status,
        ed.subject AS summary,
        ed.status || ' · ' || ed."trigger" AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM email_deliveries ed
      WHERE ed.task_id = $1

      UNION ALL

      -- Cancelled (legacy tasks without a history row)
      SELECT
        'cancelled:' || t.id::text AS id,
        'cancelled'::text AS event_type,
        t.cancelled_at AS recorded_at,
        NULL::text AS actor_name,
        t.status_before_cancel::text AS from_status,
        'Cancelled'::text AS to_status,
        NULL::text AS summary,
        NULL::text AS detail,
        NULL::numeric AS latitude,
        NULL::numeric AS longitude,
        NULL::numeric AS accuracy_meters
      FROM tasks t
      WHERE t.id = $1
        AND t.cancelled_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM task_history_events h
          WHERE h.task_id = t.id
            AND h.event_type IN ('status_changed', 'cancelled')
            AND h.to_status = 'Cancelled'::task_status
        )
    ) events
    ORDER BY recorded_at ASC, id ASC
    `,
    [taskId],
  );

  const events = rows.map((row) => ({
    id: String(row.id),
    type: String(row.event_type),
    at: isoOrNull(row.recorded_at),
    actorName: row.actor_name ? String(row.actor_name) : null,
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: row.to_status ? String(row.to_status) : null,
    summary: row.summary ? String(row.summary) : null,
    detail: row.detail ? String(row.detail) : null,
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    accuracyMeters: numOrNull(row.accuracy_meters),
    count: null,
  }));

  return coalesceAttachmentHistoryEvents(coalesceRelatedHistoryEvents(events));
}

/**
 * Customer-safe timeline: status milestones + docket/POD documents only.
 * No crew names, GPS, emails, attachments, or completion notes.
 * @param {number} taskId
 */
export async function getPublicTaskHistory(taskId) {
  if (!Number.isInteger(taskId) || taskId < 1) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const pool = getPool();

  const exists = await pool.query(
    `SELECT 1 FROM tasks WHERE id = $1 AND deleted_at IS NULL`,
    [taskId],
  );
  if (exists.rowCount === 0) {
    throw Object.assign(new Error("Task not found"), { status: 404 });
  }

  const { rows } = await pool.query(
    `
    SELECT * FROM (
      SELECT
        'created:' || t.id::text AS id,
        'created'::text AS event_type,
        t.created_at AS recorded_at,
        NULL::text AS from_status,
        NULL::text AS to_status,
        NULL::text AS detail
      FROM tasks t
      WHERE t.id = $1

      UNION ALL

      SELECT
        'history:' || h.id::text AS id,
        h.event_type,
        h.recorded_at,
        h.from_status::text,
        h.to_status::text,
        NULL::text AS detail
      FROM task_history_events h
      WHERE h.task_id = $1
        AND h.event_type IN ('status_changed', 'cancelled', 'restored', 'created')

      UNION ALL

      SELECT
        'document:' || d.id::text AS id,
        'document_generated'::text AS event_type,
        d.generated_at AS recorded_at,
        NULL::text AS from_status,
        NULL::text AS to_status,
        d.kind AS detail
      FROM task_documents d
      WHERE d.task_id = $1
        AND d.kind IN ('delivery_docket', 'pod')

      UNION ALL

      SELECT
        'cancelled:' || t.id::text AS id,
        'cancelled'::text AS event_type,
        t.cancelled_at AS recorded_at,
        t.status_before_cancel::text AS from_status,
        'Cancelled'::text AS to_status,
        NULL::text AS detail
      FROM tasks t
      WHERE t.id = $1
        AND t.cancelled_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM task_history_events h
          WHERE h.task_id = t.id
            AND h.event_type IN ('status_changed', 'cancelled')
            AND h.to_status = 'Cancelled'::task_status
        )
    ) events
    ORDER BY recorded_at ASC, id ASC
    `,
    [taskId],
  );

  return rows.map((row) => {
    const type = String(row.event_type);
    const fromStatus = row.from_status ? String(row.from_status) : null;
    const toStatus = row.to_status ? String(row.to_status) : null;
    const detail = row.detail ? String(row.detail) : null;

    let title = type;
    if (type === "created") {
      title = "Order received";
    } else if (type === "cancelled") {
      title = fromStatus
        ? `Cancelled (was ${fromStatus})`
        : "Cancelled";
    } else if (type === "restored") {
      title = `Restored to ${toStatus ?? "Undetermined"}`;
    } else if (type === "status_changed") {
      title =
        fromStatus && toStatus
          ? `Status ${fromStatus} → ${toStatus}`
          : toStatus
            ? `Status → ${toStatus}`
            : "Status updated";
    } else if (type === "document_generated") {
      if (detail === "pod") title = "Proof of delivery available";
      else if (detail === "delivery_docket") title = "Delivery docket available";
      else title = "Document available";
    }

    return {
      id: String(row.id),
      type,
      at: isoOrNull(row.recorded_at),
      title,
      fromStatus,
      toStatus,
      detail,
    };
  });
}

/**
 * Crew start/end logs a status_changed (and often a note) at the same instant.
 * Fold those into one timeline row so the UI shows a single action.
 *
 * @param {Array<{
 *   id: string,
 *   type: string,
 *   at: string | null,
 *   actorName: string | null,
 *   fromStatus: string | null,
 *   toStatus: string | null,
 *   summary: string | null,
 *   detail: string | null,
 *   latitude: number | null,
 *   longitude: number | null,
 *   accuracyMeters: number | null,
 *   count: number | null,
 * }>} events
 */
function coalesceRelatedHistoryEvents(events) {
  const skip = new Set();
  /** @type {typeof events} */
  const out = [];

  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const event = events[i];

    if (event.type !== "crew_started" && event.type !== "crew_ended") {
      out.push(event);
      continue;
    }

    const crewVerb = event.type === "crew_started" ? "started" : "ended";
    const merged = { ...event };

    for (let j = 0; j < events.length; j++) {
      if (j === i || skip.has(j)) continue;
      const other = events[j];
      if (!sameHistoryActor(event, other) || !nearHistoryTime(event.at, other.at)) {
        continue;
      }

      if (
        other.type === "status_changed" &&
        typeof other.summary === "string" &&
        other.summary.includes(`via crew ${crewVerb}`)
      ) {
        merged.fromStatus = other.fromStatus ?? merged.fromStatus;
        merged.toStatus = other.toStatus ?? merged.toStatus;
        skip.add(j);
        continue;
      }

      if (event.type === "crew_ended" && other.type === "note_added") {
        if (other.summary) merged.summary = other.summary;
        skip.add(j);
      }
    }

    out.push(merged);
  }

  // Drop any crew-derived status rows that weren't folded (orphan / ordering edge).
  return out.filter((event) => {
    if (event.type !== "status_changed") return true;
    return !(
      typeof event.summary === "string" &&
      /^Status changed via crew (started|ended)$/.test(event.summary)
    );
  });
}

/**
 * Burst uploads (multi-shot camera, gallery pick) produce many attachment rows.
 * Fold same-actor + same-kind adds within a few minutes into one timeline row.
 *
 * @param {Array<{
 *   id: string,
 *   type: string,
 *   at: string | null,
 *   actorName: string | null,
 *   fromStatus: string | null,
 *   toStatus: string | null,
 *   summary: string | null,
 *   detail: string | null,
 *   latitude: number | null,
 *   longitude: number | null,
 *   accuracyMeters: number | null,
 *   count: number | null,
 * }>} events
 */
function coalesceAttachmentHistoryEvents(events) {
  /** @type {typeof events} */
  const out = [];
  const ATTACHMENT_BURST_MS = 5 * 60 * 1000;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "attachment_added") {
      out.push(event);
      continue;
    }

    let count = 1;
    let lastAt = event.at;
    let j = i + 1;
    while (j < events.length) {
      const next = events[j];
      if (next.type !== "attachment_added") break;
      if (!sameAttachmentBatch(event, next)) break;
      if (!nearHistoryTime(lastAt, next.at, ATTACHMENT_BURST_MS)) break;
      count += 1;
      lastAt = next.at;
      j += 1;
    }

    if (count === 1) {
      out.push(event);
    } else {
      out.push({
        ...event,
        // Drop per-file names — the batch count is the useful signal.
        summary: null,
        count,
      });
      i = j - 1;
    }
  }

  return out;
}

/**
 * @param {{ actorName: string | null, detail: string | null }} a
 * @param {{ actorName: string | null, detail: string | null }} b
 */
function sameAttachmentBatch(a, b) {
  if ((a.detail ?? null) !== (b.detail ?? null)) return false;
  if (!a.actorName && !b.actorName) return true;
  if (!a.actorName || !b.actorName) return false;
  return a.actorName === b.actorName;
}

/**
 * @param {{ actorName: string | null }} a
 * @param {{ actorName: string | null }} b
 */
function sameHistoryActor(a, b) {
  if (!a.actorName || !b.actorName) return false;
  return a.actorName === b.actorName;
}

/**
 * @param {string | null} a
 * @param {string | null} b
 * @param {number} [windowMs]
 */
function nearHistoryTime(a, b, windowMs = 2000) {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= windowMs;
}
