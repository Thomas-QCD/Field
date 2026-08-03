/**
 * Shared RDS connection helpers for one-off scripts.
 */
import { execFileSync } from "node:child_process";
import pg from "pg";

export const SECRET_ARN =
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";
export const HOST = "field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com";
export const PORT = 5432;
export const DATABASE = "field";
export const USER = "field_admin";

export function getPassword() {
  if (process.env.DATABASE_URL) {
    return decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  }
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;

  const raw = execFileSync(
    "aws",
    [
      "secretsmanager",
      "get-secret-value",
      "--region",
      "us-west-1",
      "--secret-id",
      SECRET_ARN,
      "--query",
      "SecretString",
      "--output",
      "text",
    ],
    { encoding: "utf8" },
  ).trim();

  const parsed = JSON.parse(raw);
  if (!parsed.password) {
    throw new Error("Secrets Manager payload missing password");
  }
  return parsed.password;
}

/** @param {string} [password] */
export function createPgClient(password = getPassword()) {
  return new pg.Client({
    host: HOST,
    port: PORT,
    database: DATABASE,
    user: USER,
    password,
    ssl: { rejectUnauthorized: false },
  });
}
