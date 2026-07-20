import pg from "pg";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const SECRET_ARN =
  process.env.DB_SECRET_ARN ||
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";

const PGHOST =
  process.env.PGHOST || "field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com";
const PGPORT = Number(process.env.PGPORT || 5432);
const PGDATABASE = process.env.PGDATABASE || "field";
const PGUSER = process.env.PGUSER || "field_admin";

/** @type {pg.Pool | null} */
let pool = null;
/** @type {Promise<string> | null} */
let passwordPromise = null;

async function getPassword() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  if (process.env.DATABASE_URL) {
    return decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  }
  if (!passwordPromise) {
    passwordPromise = (async () => {
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || "us-west-1",
      });
      const res = await client.send(
        new GetSecretValueCommand({ SecretId: SECRET_ARN }),
      );
      const parsed = JSON.parse(res.SecretString || "{}");
      if (!parsed.password) {
        throw new Error("Secrets Manager payload missing password");
      }
      return parsed.password;
    })().catch((err) => {
      passwordPromise = null;
      throw err;
    });
  }
  return passwordPromise;
}

export async function getPool() {
  if (pool) return pool;
  const password = await getPassword();
  pool = new pg.Pool({
    host: PGHOST,
    port: PGPORT,
    database: PGDATABASE,
    user: PGUSER,
    password,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}
