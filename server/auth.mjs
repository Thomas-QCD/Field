import { createRemoteJWKSet, jwtVerify } from "jose";
import { getPool } from "./db.mjs";
import {
  looksLikeJwt,
  verifyDeviceSessionToken,
} from "./mobileAuth.mjs";

/**
 * @returns {boolean}
 */
export function isEntraAuthEnabled() {
  const tenant = (process.env.AZURE_TENANT_ID ?? "").trim();
  const client = (process.env.AZURE_CLIENT_ID ?? "").trim();
  return Boolean(tenant && client);
}

/**
 * @param {string} pathname
 */
export function isAuthExemptPath(pathname) {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/mobile/activate") return true;
  if (pathname.startsWith("/api/public/")) return true;
  return false;
}

/**
 * @param {string} tenantId
 */
function issuerForTenant(tenantId) {
  return `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

/** @type {ReturnType<typeof createRemoteJWKSet> | null} */
let jwks = null;

/**
 * @param {string} tenantId
 */
function getJwks(tenantId) {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
  }
  return jwks;
}

/**
 * @typedef {{ oid: string, email: string | null, name: string | null }} EntraClaims
 */

/**
 * Verify Entra ID token (aud = client id) or access token (aud = AZURE_API_AUDIENCE).
 * @param {string} token
 * @returns {Promise<EntraClaims>}
 */
export async function verifyEntraToken(token) {
  const tenantId = (process.env.AZURE_TENANT_ID ?? "").trim();
  const clientId = (process.env.AZURE_CLIENT_ID ?? "").trim();
  const apiAudience = (process.env.AZURE_API_AUDIENCE ?? "").trim();

  if (!tenantId || !clientId) {
    throw Object.assign(new Error("Entra auth is not configured"), { status: 500 });
  }

  const audiences = apiAudience ? [clientId, apiAudience] : [clientId];

  const { payload } = await jwtVerify(token, getJwks(tenantId), {
    issuer: issuerForTenant(tenantId),
    audience: audiences,
  });

  const oid = typeof payload.oid === "string" ? payload.oid : null;
  if (!oid) {
    throw Object.assign(new Error("Token missing oid claim"), { status: 401 });
  }

  const email =
    (typeof payload.preferred_username === "string" && payload.preferred_username) ||
    (typeof payload.email === "string" && payload.email) ||
    null;
  const name = typeof payload.name === "string" ? payload.name : null;

  return { oid, email, name };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {string | null}
 */
export function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Upsert users row from Entra claims. New users get role `admin` (web creators).
 * If email already exists under a different id (imported user), link to that row
 * instead of inserting a second identity with the Entra oid.
 * @param {EntraClaims} claims
 */
export async function upsertUserFromEntra(claims) {
  const pool = getPool();
  const displayName =
    (claims.name && claims.name.trim()) ||
    (claims.email && claims.email.trim()) ||
    "Entra user";

  const byId = await pool.query(
    `SELECT id, display_name, role FROM users WHERE id = $1::uuid`,
    [claims.oid],
  );
  if (byId.rows[0]) {
    const { rows } = await pool.query(
      `UPDATE users SET
         display_name = $2,
         email = COALESCE($3, email),
         updated_at = now(),
         is_active = true
       WHERE id = $1::uuid
       RETURNING id, display_name, role`,
      [claims.oid, displayName, claims.email],
    );
    const row = rows[0];
    return {
      id: String(row.id),
      displayName: row.display_name,
      role: row.role,
    };
  }

  if (claims.email) {
    const byEmail = await pool.query(
      `SELECT id, display_name, role FROM users WHERE lower(email) = lower($1)`,
      [claims.email],
    );
    if (byEmail.rows[0]) {
      const { rows } = await pool.query(
        `UPDATE users SET
           display_name = $2,
           updated_at = now(),
           is_active = true
         WHERE id = $1::uuid
         RETURNING id, display_name, role`,
        [byEmail.rows[0].id, displayName],
      );
      const row = rows[0];
      return {
        id: String(row.id),
        displayName: row.display_name,
        role: row.role,
      };
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO users (id, display_name, email, role, is_active)
     VALUES ($1::uuid, $2, $3, 'admin', true)
     RETURNING id, display_name, role`,
    [claims.oid, displayName, claims.email],
  );

  const row = rows[0];
  return {
    id: String(row.id),
    displayName: row.display_name,
    role: row.role,
  };
}

/**
 * When Entra is enabled, require a valid Bearer token (Entra JWT or mobile device
 * session), except exempt paths. Attaches `req.auth` on success.
 * @param {import('node:http').IncomingMessage} req
 * @param {string} pathname
 */
export async function requireWebAuth(req, pathname) {
  if (!isEntraAuthEnabled()) {
    return null;
  }
  if (isAuthExemptPath(pathname)) {
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  if (!looksLikeJwt(token)) {
    const device = await verifyDeviceSessionToken(token);
    // @ts-ignore attach auth context for handlers
    req.auth = {
      userId: device.userId,
      deviceSession: device,
    };
    return device;
  }

  try {
    const claims = await verifyEntraToken(token);
    // @ts-ignore attach auth context for handlers
    req.auth = { userId: claims.oid, claims };
    return claims;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) throw err;
    const message = err instanceof Error ? err.message : "Invalid token";
    throw Object.assign(new Error(message), { status: 401 });
  }
}
