import { createServer } from "node:http";
import {
  confirmAttachment,
  createPresign,
  deleteAttachment,
  getAttachmentDownloadUrl,
  listAttachments,
} from "./attachments.mjs";
import { getPool } from "./db.mjs";
import { createTask, updateTask } from "./createTask.mjs";

const PORT = Number(process.env.API_PORT) || 3000;

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 * @param {number} [status]
 */
function sendJson(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

/**
 * @param {import('node:http').ServerResponse} res
 */
function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}

/**
 * @param {string} url
 */
function parseUrl(url) {
  return new URL(url, `http://localhost:${PORT}`);
}

/**
 * @param {import('pg').QueryResultRow} row
 */
function mapContactRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? "",
  };
}

const CONTACT_SELECT = `
  SELECT
    c.id,
    c.name,
    c.phone,
    COALESCE(c.email, '') AS email
  FROM contacts c
  WHERE c.deleted_at IS NULL
`;

async function listContacts() {
  const pool = getPool();
  const { rows } = await pool.query(
    `${CONTACT_SELECT}
     ORDER BY c.name`,
  );
  return rows.map(mapContactRow);
}

/**
 * @param {string} q
 */
async function searchContacts(q) {
  const pool = getPool();
  const { rows } = await pool.query(
    `${CONTACT_SELECT}
       AND (
         c.name ILIKE '%' || $1 || '%'
         OR COALESCE(c.email, '') ILIKE '%' || $1 || '%'
         OR COALESCE(c.phone, '') ILIKE '%' || $1 || '%'
       )
     ORDER BY
       CASE WHEN lower(c.name) LIKE lower($1) || '%' THEN 0 ELSE 1 END,
       c.name
     LIMIT 20`,
    [q],
  );
  return rows.map(mapContactRow);
}

/**
 * @param {number} id
 */
async function getContact(id) {
  const pool = getPool();
  const { rows } = await pool.query(`${CONTACT_SELECT} AND c.id = $1`, [id]);
  return rows[0] ? mapContactRow(rows[0]) : null;
}

/**
 * @param {import('pg').QueryResultRow} row
 */
function mapAddressRow(row) {
  return {
    id: Number(row.id),
    addressName: row.address_name ?? "",
    streetLine: row.street_line,
    building: row.building ?? "",
    notes: row.notes ?? "",
  };
}

async function listAddresses() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, address_name, street_line, building, notes
     FROM addresses
     WHERE deleted_at IS NULL
     ORDER BY COALESCE(NULLIF(address_name, ''), street_line), id`,
  );
  return rows.map(mapAddressRow);
}

/**
 * @param {number} id
 */
async function getAddress(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, address_name, street_line, building, notes
     FROM addresses
     WHERE id = $1
       AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ? mapAddressRow(rows[0]) : null;
}

/**
 * @param {unknown} body
 */
async function createContact(body) {
  const name =
    body && typeof body === "object" && "name" in body
      ? String(body.name ?? "").trim()
      : "";
  if (!name) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  if (name.length > 255) {
    throw Object.assign(new Error("name must be 255 characters or fewer"), {
      status: 400,
    });
  }

  const phone =
    body && typeof body === "object" && "phone" in body
      ? String(body.phone ?? "").trim() || null
      : null;
  if (phone && phone.length > 50) {
    throw Object.assign(new Error("phone must be 50 characters or fewer"), {
      status: 400,
    });
  }

  const email =
    body && typeof body === "object" && "email" in body
      ? String(body.email ?? "").trim() || null
      : null;
  if (email && email.length > 255) {
    throw Object.assign(new Error("email must be 255 characters or fewer"), {
      status: 400,
    });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO contacts (name, phone, email)
     VALUES ($1, $2, $3)
     RETURNING id, name, phone, COALESCE(email, '') AS email`,
    [name, phone, email],
  );
  return mapContactRow(rows[0]);
}

/**
 * @param {number} id
 * @param {unknown} body
 */
async function updateContact(id, body) {
  const name =
    body && typeof body === "object" && "name" in body
      ? String(body.name ?? "").trim()
      : "";
  if (!name) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  if (name.length > 255) {
    throw Object.assign(new Error("name must be 255 characters or fewer"), {
      status: 400,
    });
  }

  const phone =
    body && typeof body === "object" && "phone" in body
      ? String(body.phone ?? "").trim() || null
      : null;
  if (phone && phone.length > 50) {
    throw Object.assign(new Error("phone must be 50 characters or fewer"), {
      status: 400,
    });
  }

  const email =
    body && typeof body === "object" && "email" in body
      ? String(body.email ?? "").trim() || null
      : null;
  if (email && email.length > 255) {
    throw Object.assign(new Error("email must be 255 characters or fewer"), {
      status: 400,
    });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE contacts
     SET name = $2,
         phone = $3,
         email = $4,
         updated_at = now()
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING id, name, phone, COALESCE(email, '') AS email`,
    [id, name, phone, email],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error("Contact not found"), { status: 404 });
  }
  return mapContactRow(rows[0]);
}

/**
 * @param {number} id
 */
async function deleteContact(id) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE contacts
     SET deleted_at = now(),
         updated_at = now()
     WHERE id = $1
       AND deleted_at IS NULL`,
    [id],
  );
  if (rowCount === 0) {
    throw Object.assign(new Error("Contact not found"), { status: 404 });
  }
}

/**
 * @param {unknown} body
 */
async function createAddress(body) {
  const addressName =
    body && typeof body === "object" && "addressName" in body
      ? String(body.addressName ?? "").trim() || null
      : null;
  if (addressName && addressName.length > 255) {
    throw Object.assign(
      new Error("addressName must be 255 characters or fewer"),
      { status: 400 },
    );
  }

  const streetLine =
    body && typeof body === "object" && "streetLine" in body
      ? String(body.streetLine ?? "").trim()
      : "";
  if (!streetLine) {
    throw Object.assign(new Error("streetLine is required"), { status: 400 });
  }
  if (streetLine.length > 500) {
    throw Object.assign(
      new Error("streetLine must be 500 characters or fewer"),
      { status: 400 },
    );
  }

  const building =
    body && typeof body === "object" && "building" in body
      ? String(body.building ?? "").trim() || null
      : null;
  if (building && building.length > 255) {
    throw Object.assign(new Error("building must be 255 characters or fewer"), {
      status: 400,
    });
  }

  const notes =
    body && typeof body === "object" && "notes" in body
      ? String(body.notes ?? "").trim() || null
      : null;

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO addresses (address_name, street_line, building, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING id, address_name, street_line, building, notes`,
    [addressName, streetLine, building, notes],
  );
  return mapAddressRow(rows[0]);
}

/**
 * @param {number} id
 * @param {unknown} body
 */
async function updateAddress(id, body) {
  const addressName =
    body && typeof body === "object" && "addressName" in body
      ? String(body.addressName ?? "").trim() || null
      : null;
  if (addressName && addressName.length > 255) {
    throw Object.assign(
      new Error("addressName must be 255 characters or fewer"),
      { status: 400 },
    );
  }

  const streetLine =
    body && typeof body === "object" && "streetLine" in body
      ? String(body.streetLine ?? "").trim()
      : "";
  if (!streetLine) {
    throw Object.assign(new Error("streetLine is required"), { status: 400 });
  }
  if (streetLine.length > 500) {
    throw Object.assign(
      new Error("streetLine must be 500 characters or fewer"),
      { status: 400 },
    );
  }

  const building =
    body && typeof body === "object" && "building" in body
      ? String(body.building ?? "").trim() || null
      : null;
  if (building && building.length > 255) {
    throw Object.assign(new Error("building must be 255 characters or fewer"), {
      status: 400,
    });
  }

  const notes =
    body && typeof body === "object" && "notes" in body
      ? String(body.notes ?? "").trim() || null
      : null;

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE addresses
     SET address_name = $2,
         street_line = $3,
         building = $4,
         notes = $5
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING id, address_name, street_line, building, notes`,
    [id, addressName, streetLine, building, notes],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error("Address not found"), { status: 404 });
  }
  return mapAddressRow(rows[0]);
}

/**
 * @param {number} id
 */
async function deleteAddress(id) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE addresses
     SET deleted_at = now()
     WHERE id = $1
       AND deleted_at IS NULL`,
    [id],
  );
  if (rowCount === 0) {
    throw Object.assign(new Error("Address not found"), { status: 404 });
  }
}

/**
 * @param {number} id
 */
async function deleteTask(id) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE tasks
     SET deleted_at = now(),
         updated_at = now()
     WHERE id = $1
       AND deleted_at IS NULL`,
    [id],
  );
  if (rowCount === 0) {
    throw Object.assign(new Error("Task not found"), { status: 404 });
  }
}

/**
 * @param {string | null} role
 */
async function listUsers(role) {
  const pool = getPool();
  const params = [];
  let roleClause = "";
  if (role) {
    params.push(role);
    roleClause = `AND role = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT id, display_name, role
     FROM users
     WHERE is_active = true
       ${roleClause}
     ORDER BY display_name`,
    params,
  );

  return rows.map((row) => ({
    id: String(row.id),
    displayName: row.display_name,
    role: row.role,
  }));
}

/**
 * @param {{ crewMemberId?: string | null }} [opts]
 */
async function listTasks(opts = {}) {
  const pool = getPool();
  const crewMemberId =
    typeof opts.crewMemberId === "string" && opts.crewMemberId.trim()
      ? opts.crewMemberId.trim()
      : null;
  const params = [];
  let crewClause = "";
  if (crewMemberId) {
    params.push(crewMemberId);
    crewClause = `AND EXISTS (
         SELECT 1
         FROM task_crew_members tcm_filter
         WHERE tcm_filter.task_id = t.id
           AND tcm_filter.user_id = $${params.length}
       )`;
  }

  const { rows } = await pool.query(
    `SELECT
       t.id,
       t.task_type,
       t.status,
       t.external_key,
       t.description,
       t.window_start_at,
       t.window_end_at,
       cu.display_name AS created_by_name,
       (
         SELECT string_agg(c.name, ', ' ORDER BY c.name)
         FROM task_contacts tc
         JOIN contacts c ON c.id = tc.contact_id
         WHERE tc.task_id = t.id
       ) AS contact_names,
       CASE
         WHEN a.id IS NULL THEN ''
         WHEN a.address_name IS NOT NULL AND a.address_name <> ''
           THEN a.address_name
         WHEN a.building IS NOT NULL AND a.building <> ''
           THEN a.street_line || ', ' || a.building
         ELSE a.street_line
       END AS destination_address,
       (
         SELECT string_agg(u.display_name, ', ' ORDER BY u.display_name)
         FROM task_crew_members tcm
         JOIN users u ON u.id = tcm.user_id
         WHERE tcm.task_id = t.id
       ) AS crew_name
     FROM tasks t
     LEFT JOIN addresses a ON a.id = t.destination_address_id
     LEFT JOIN users cu ON cu.id = t.created_by_user_id
     WHERE t.deleted_at IS NULL
       ${crewClause}
     ORDER BY t.created_at DESC, t.id DESC`,
    params,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    taskType: row.task_type,
    status: row.status,
    externalKey: row.external_key ?? "",
    description: row.description ?? "",
    contactNames: row.contact_names ?? "",
    destinationAddress: row.destination_address ?? "",
    crewName: row.crew_name ?? null,
    createdByName: row.created_by_name ?? "",
    windowStartAt: row.window_start_at
      ? new Date(row.window_start_at).toISOString()
      : null,
    windowEndAt: row.window_end_at
      ? new Date(row.window_end_at).toISOString()
      : null,
  }));
}

/**
 * @param {number} id
 */
async function getTask(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       t.id,
       t.task_type,
       t.status,
       t.description,
       t.external_key,
       t.crew_size,
       t.estimated_hours,
       t.is_time_specific,
       t.can_start_early,
       t.window_start_at,
       t.window_end_at,
       t.completed_notes,
       t.completed_at,
       t.failed_reason,
       t.created_at,
       t.updated_at,
       t.destination_address_id,
       COALESCE(a.address_name, '') AS destination_address_name,
       COALESCE(a.street_line, '') AS destination_address,
       COALESCE(a.building, '') AS destination_building,
       COALESCE(a.notes, '') AS destination_notes,
       cu.display_name AS created_by_name,
       (
         SELECT coalesce(
           json_agg(
             json_build_object(
               'id', c.id,
               'name', c.name,
               'phone', COALESCE(c.phone, ''),
               'email', COALESCE(c.email, '')
             )
             ORDER BY c.name
           ),
           '[]'::json
         )
         FROM task_contacts tc
         JOIN contacts c ON c.id = tc.contact_id
         WHERE tc.task_id = t.id
       ) AS contacts,
       (
         SELECT coalesce(
           json_agg(
             json_build_object(
               'id', u.id::text,
               'displayName', u.display_name
             )
             ORDER BY u.display_name
           ),
           '[]'::json
         )
         FROM task_crew_members tcm
         JOIN users u ON u.id = tcm.user_id
         WHERE tcm.task_id = t.id
       ) AS crew_members
     FROM tasks t
     LEFT JOIN addresses a ON a.id = t.destination_address_id
     LEFT JOIN users cu ON cu.id = t.created_by_user_id
     WHERE t.id = $1
       AND t.deleted_at IS NULL`,
    [id],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: Number(row.id),
    taskType: row.task_type,
    status: row.status,
    description: row.description ?? "",
    externalKey: row.external_key ?? "",
    destinationAddressId:
      row.destination_address_id != null
        ? Number(row.destination_address_id)
        : null,
    destinationAddressName: row.destination_address_name,
    destinationAddress: row.destination_address,
    destinationBuilding: row.destination_building,
    destinationNotes: row.destination_notes,
    contacts: Array.isArray(row.contacts) ? row.contacts : [],
    crewSize: row.crew_size != null ? Number(row.crew_size) : null,
    estimatedHours:
      row.estimated_hours != null ? Number(row.estimated_hours) : null,
    isTimeSpecific: Boolean(row.is_time_specific),
    canStartEarly: Boolean(row.can_start_early),
    windowStartAt: row.window_start_at
      ? new Date(row.window_start_at).toISOString()
      : null,
    windowEndAt: row.window_end_at
      ? new Date(row.window_end_at).toISOString()
      : null,
    completedNotes: row.completed_notes ?? null,
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    failedReason: row.failed_reason ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdByName: row.created_by_name ?? "",
    crewMembers: Array.isArray(row.crew_members) ? row.crew_members : [],
  };
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, {});
    return;
  }

  try {
    const url = parseUrl(req.url ?? "/");

    if (req.method === "GET" && url.pathname === "/api/contacts") {
      const q = (url.searchParams.get("q") ?? "").trim();
      const contacts =
        q.length < 1 ? await listContacts() : await searchContacts(q);
      sendJson(res, { contacts });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/contacts") {
      const body = await readJsonBody(req);
      const contact = await createContact(body);
      sendJson(res, { contact }, 201);
      return;
    }

    const contactMatch = url.pathname.match(/^\/api\/contacts\/(\d+)$/);
    if (req.method === "GET" && contactMatch) {
      const contact = await getContact(Number(contactMatch[1]));
      if (!contact) {
        sendJson(res, { error: "Contact not found" }, 404);
        return;
      }
      sendJson(res, { contact });
      return;
    }
    if (req.method === "PUT" && contactMatch) {
      const body = await readJsonBody(req);
      const contact = await updateContact(Number(contactMatch[1]), body);
      sendJson(res, { contact });
      return;
    }
    if (req.method === "DELETE" && contactMatch) {
      await deleteContact(Number(contactMatch[1]));
      sendNoContent(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/addresses") {
      const addresses = await listAddresses();
      sendJson(res, { addresses });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/addresses") {
      const body = await readJsonBody(req);
      const address = await createAddress(body);
      sendJson(res, { address }, 201);
      return;
    }

    const addressMatch = url.pathname.match(/^\/api\/addresses\/(\d+)$/);
    if (req.method === "GET" && addressMatch) {
      const address = await getAddress(Number(addressMatch[1]));
      if (!address) {
        sendJson(res, { error: "Address not found" }, 404);
        return;
      }
      sendJson(res, { address });
      return;
    }
    if (req.method === "PUT" && addressMatch) {
      const body = await readJsonBody(req);
      const address = await updateAddress(Number(addressMatch[1]), body);
      sendJson(res, { address });
      return;
    }
    if (req.method === "DELETE" && addressMatch) {
      await deleteAddress(Number(addressMatch[1]));
      sendNoContent(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const role = (url.searchParams.get("role") ?? "").trim() || null;
      const users = await listUsers(role);
      sendJson(res, { users });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      const crewMemberId =
        (url.searchParams.get("crewMemberId") ?? "").trim() || null;
      const tasks = await listTasks({ crewMemberId });
      sendJson(res, { tasks });
      return;
    }

    const attachmentPresignMatch = url.pathname.match(
      /^\/api\/tasks\/(\d+)\/attachments\/presign$/,
    );
    if (req.method === "POST" && attachmentPresignMatch) {
      const taskId = Number(attachmentPresignMatch[1]);
      const body = await readJsonBody(req);
      const result = await createPresign(taskId, body);
      sendJson(res, result);
      return;
    }

    const attachmentUrlMatch = url.pathname.match(
      /^\/api\/tasks\/(\d+)\/attachments\/(\d+)\/url$/,
    );
    if (req.method === "GET" && attachmentUrlMatch) {
      const taskId = Number(attachmentUrlMatch[1]);
      const attachmentId = Number(attachmentUrlMatch[2]);
      const inline = url.searchParams.get("inline") === "1";
      const result = await getAttachmentDownloadUrl(taskId, attachmentId, {
        inline,
      });
      sendJson(res, result);
      return;
    }

    const attachmentItemMatch = url.pathname.match(
      /^\/api\/tasks\/(\d+)\/attachments\/(\d+)$/,
    );
    if (req.method === "DELETE" && attachmentItemMatch) {
      const taskId = Number(attachmentItemMatch[1]);
      const attachmentId = Number(attachmentItemMatch[2]);
      await deleteAttachment(taskId, attachmentId);
      sendNoContent(res);
      return;
    }

    const attachmentsMatch = url.pathname.match(
      /^\/api\/tasks\/(\d+)\/attachments$/,
    );
    if (req.method === "GET" && attachmentsMatch) {
      const taskId = Number(attachmentsMatch[1]);
      const attachments = await listAttachments(taskId);
      sendJson(res, { attachments });
      return;
    }
    if (req.method === "POST" && attachmentsMatch) {
      const taskId = Number(attachmentsMatch[1]);
      const body = await readJsonBody(req);
      const attachment = await confirmAttachment(taskId, body);
      sendJson(res, { attachment }, 201);
      return;
    }

    const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === "GET" && taskMatch) {
      const task = await getTask(Number(taskMatch[1]));
      if (!task) {
        sendJson(res, { error: "Task not found" }, 404);
        return;
      }
      const attachments = await listAttachments(Number(taskMatch[1]));
      sendJson(res, { task: { ...task, attachments } });
      return;
    }
    if (req.method === "PUT" && taskMatch) {
      const body = await readJsonBody(req);
      const task = await updateTask(Number(taskMatch[1]), body);
      sendJson(res, { task });
      return;
    }
    if (req.method === "DELETE" && taskMatch) {
      await deleteTask(Number(taskMatch[1]));
      sendNoContent(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks") {
      const body = await readJsonBody(req);
      const task = await createTask(body);
      sendJson(res, { task }, 201);
      return;
    }

    sendJson(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : 500;
    sendJson(
      res,
      { error: err instanceof Error ? err.message : "Server error" },
      status,
    );
  }
});

server.listen(PORT, () => {
  console.log(`Field API listening on http://localhost:${PORT}`);
});
