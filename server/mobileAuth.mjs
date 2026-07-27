import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPool } from "./db.mjs";

export const ACTIVATION_CODE_PREFIX = "field1.";
export const ACTIVATION_CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVATION_CODE_PATTERN = /^field1\.[A-Za-z0-9_-]+$/;

/**
 * @param {string} value
 */
export function hashSecret(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * @returns {string}
 */
export function mintActivationCode() {
  return `${ACTIVATION_CODE_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/**
 * @returns {string}
 */
export function mintDeviceSessionToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeActivationCode(raw) {
  if (typeof raw !== "string") {
    throw Object.assign(new Error("code is required"), { status: 400 });
  }
  const code = raw.trim();
  if (!ACTIVATION_CODE_PATTERN.test(code)) {
    throw Object.assign(new Error("Invalid activation code"), { status: 400 });
  }
  return code;
}

/**
 * Issue a single-use activation code for a crew user.
 * @param {{ userId: string, createdByUserId: string }} input
 */
export async function issueActivationCode(input) {
  const userId = String(input.userId ?? "").trim();
  const createdByUserId = String(input.createdByUserId ?? "").trim();
  if (!userId) {
    throw Object.assign(new Error("userId is required"), { status: 400 });
  }
  if (!createdByUserId) {
    throw Object.assign(new Error("createdByUserId is required"), {
      status: 400,
    });
  }

  const pool = getPool();
  const target = await pool.query(
    `SELECT id, display_name, role, is_active FROM users WHERE id = $1::uuid`,
    [userId],
  );
  if (!target.rows[0]) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
  if (!target.rows[0].is_active) {
    throw Object.assign(new Error("User is inactive"), { status: 400 });
  }

  const issuer = await pool.query(
    `SELECT id FROM users WHERE id = $1::uuid AND is_active = true`,
    [createdByUserId],
  );
  if (!issuer.rows[0]) {
    throw Object.assign(new Error("Issuer user not found"), { status: 400 });
  }

  const id = randomUUID();
  const code = mintActivationCode();
  const codeHash = hashSecret(code);
  const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_MS);

  const { rows } = await pool.query(
    `INSERT INTO mobile_activation_codes
       (id, user_id, code_hash, expires_at, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid)
     RETURNING id, expires_at`,
    [id, userId, codeHash, expiresAt.toISOString(), createdByUserId],
  );

  return {
    id: String(rows[0].id),
    code,
    expiresAt: new Date(rows[0].expires_at).toISOString(),
    userId,
    displayName: target.rows[0].display_name,
  };
}

/**
 * Exchange an activation QR code for a durable device session.
 * @param {{ code: unknown, deviceLabel?: unknown }} input
 */
export async function activateMobileDevice(input) {
  const code = normalizeActivationCode(input.code);
  const deviceLabel =
    typeof input.deviceLabel === "string" && input.deviceLabel.trim()
      ? input.deviceLabel.trim().slice(0, 255)
      : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const codeHash = hashSecret(code);
    const { rows: codeRows } = await client.query(
      `SELECT id, user_id, expires_at, used_at, revoked_at
       FROM mobile_activation_codes
       WHERE code_hash = $1
       FOR UPDATE`,
      [codeHash],
    );
    const activation = codeRows[0];
    if (!activation) {
      throw Object.assign(new Error("Invalid activation code"), { status: 401 });
    }
    if (activation.revoked_at) {
      throw Object.assign(new Error("Activation code revoked"), { status: 401 });
    }
    if (activation.used_at) {
      throw Object.assign(new Error("Activation code already used"), {
        status: 401,
      });
    }
    if (new Date(activation.expires_at).getTime() <= Date.now()) {
      throw Object.assign(new Error("Activation code expired"), { status: 401 });
    }

    const { rows: userRows } = await client.query(
      `SELECT id, display_name, role, is_active
       FROM users WHERE id = $1::uuid FOR UPDATE`,
      [activation.user_id],
    );
    const user = userRows[0];
    if (!user || !user.is_active) {
      throw Object.assign(new Error("User is inactive"), { status: 401 });
    }

    await client.query(
      `UPDATE mobile_activation_codes
       SET used_at = now()
       WHERE id = $1::uuid`,
      [activation.id],
    );

    const deviceId = randomUUID();
    const deviceSessionToken = mintDeviceSessionToken();
    const tokenHash = hashSecret(deviceSessionToken);

    const { rows: deviceRows } = await client.query(
      `INSERT INTO mobile_devices
         (id, user_id, token_hash, device_label, activation_code_id, last_seen_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, now())
       RETURNING id, activated_at`,
      [deviceId, user.id, tokenHash, deviceLabel, activation.id],
    );

    await client.query("COMMIT");

    return {
      deviceSessionToken,
      userId: String(user.id),
      displayName: user.display_name,
      role: user.role,
      deviceId: String(deviceRows[0].id),
      activatedAt: new Date(deviceRows[0].activated_at).toISOString(),
    };
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

/**
 * @param {string} token
 */
export async function verifyDeviceSessionToken(token) {
  const pool = getPool();
  const tokenHash = hashSecret(token);
  const { rows } = await pool.query(
    `SELECT d.id, d.user_id, u.display_name, u.role
     FROM mobile_devices d
     JOIN users u ON u.id = d.user_id
     WHERE d.token_hash = $1
       AND d.revoked_at IS NULL
       AND u.is_active = true`,
    [tokenHash],
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  await pool.query(
    `UPDATE mobile_devices SET last_seen_at = now() WHERE id = $1::uuid`,
    [rows[0].id],
  );

  return {
    userId: String(rows[0].user_id),
    displayName: rows[0].display_name,
    role: rows[0].role,
    deviceId: String(rows[0].id),
  };
}

/**
 * @param {string} actorUserId
 */
async function assertCanManageMobileDevices(actorUserId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT role FROM users WHERE id = $1::uuid AND is_active = true`,
    [actorUserId],
  );
  if (rows[0]?.role !== "admin") {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

/**
 * List mobile device sessions for a user (active first).
 * @param {{ userId: string, actorUserId: string, includeRevoked?: boolean }} input
 */
export async function listMobileDevices(input) {
  const userId = String(input.userId ?? "").trim();
  const actorUserId = String(input.actorUserId ?? "").trim();
  if (!userId) {
    throw Object.assign(new Error("userId is required"), { status: 400 });
  }
  if (!actorUserId) {
    throw Object.assign(new Error("actorUserId is required"), { status: 400 });
  }
  await assertCanManageMobileDevices(actorUserId);

  const pool = getPool();
  const target = await pool.query(`SELECT id FROM users WHERE id = $1::uuid`, [
    userId,
  ]);
  if (!target.rows[0]) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }

  const includeRevoked = Boolean(input.includeRevoked);
  const { rows } = await pool.query(
    `SELECT id, user_id, device_label, activated_at, last_seen_at, revoked_at
     FROM mobile_devices
     WHERE user_id = $1::uuid
       AND ($2::boolean OR revoked_at IS NULL)
     ORDER BY
       CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END,
       COALESCE(last_seen_at, activated_at) DESC`,
    [userId, includeRevoked],
  );

  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    deviceLabel: row.device_label ?? null,
    activatedAt: new Date(row.activated_at).toISOString(),
    lastSeenAt: row.last_seen_at
      ? new Date(row.last_seen_at).toISOString()
      : null,
    revokedAt: row.revoked_at
      ? new Date(row.revoked_at).toISOString()
      : null,
  }));
}

/**
 * Revoke one mobile device session.
 * @param {{ userId: string, deviceId: string, revokedByUserId: string }} input
 */
export async function revokeMobileDevice(input) {
  const userId = String(input.userId ?? "").trim();
  const deviceId = String(input.deviceId ?? "").trim();
  const revokedByUserId = String(input.revokedByUserId ?? "").trim();
  if (!userId || !deviceId) {
    throw Object.assign(new Error("userId and deviceId are required"), {
      status: 400,
    });
  }
  if (!revokedByUserId) {
    throw Object.assign(new Error("revokedByUserId is required"), {
      status: 400,
    });
  }
  await assertCanManageMobileDevices(revokedByUserId);

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE mobile_devices
     SET revoked_at = now(),
         revoked_by_user_id = $3::uuid
     WHERE id = $1::uuid
       AND user_id = $2::uuid
       AND revoked_at IS NULL
     RETURNING id, user_id, device_label, activated_at, last_seen_at, revoked_at`,
    [deviceId, userId, revokedByUserId],
  );
  if (!rows[0]) {
    const existing = await pool.query(
      `SELECT id, revoked_at FROM mobile_devices
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [deviceId, userId],
    );
    if (!existing.rows[0]) {
      throw Object.assign(new Error("Device not found"), { status: 404 });
    }
    throw Object.assign(new Error("Device already revoked"), { status: 409 });
  }

  const row = rows[0];
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deviceLabel: row.device_label ?? null,
    activatedAt: new Date(row.activated_at).toISOString(),
    lastSeenAt: row.last_seen_at
      ? new Date(row.last_seen_at).toISOString()
      : null,
    revokedAt: new Date(row.revoked_at).toISOString(),
  };
}

/**
 * Revoke all active mobile device sessions for a user.
 * @param {{ userId: string, revokedByUserId: string }} input
 */
export async function revokeAllMobileDevices(input) {
  const userId = String(input.userId ?? "").trim();
  const revokedByUserId = String(input.revokedByUserId ?? "").trim();
  if (!userId) {
    throw Object.assign(new Error("userId is required"), { status: 400 });
  }
  if (!revokedByUserId) {
    throw Object.assign(new Error("revokedByUserId is required"), {
      status: 400,
    });
  }
  await assertCanManageMobileDevices(revokedByUserId);

  const pool = getPool();
  const target = await pool.query(`SELECT id FROM users WHERE id = $1::uuid`, [
    userId,
  ]);
  if (!target.rows[0]) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }

  const { rows } = await pool.query(
    `UPDATE mobile_devices
     SET revoked_at = now(),
         revoked_by_user_id = $2::uuid
     WHERE user_id = $1::uuid
       AND revoked_at IS NULL
     RETURNING id`,
    [userId, revokedByUserId],
  );

  return { revokedCount: rows.length };
}

/**
 * @param {string} token
 */
export function looksLikeJwt(token) {
  return token.split(".").length === 3;
}
