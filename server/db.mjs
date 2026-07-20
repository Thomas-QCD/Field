import { execFileSync } from "node:child_process";
import pg from "pg";

const SECRET_ARN =
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";
const HOST = "field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com";
const PORT = 5432;
const DATABASE = "field";
const USER = "field_admin";

function getPassword() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return decodeURIComponent(url.password);
  }

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

/** @type {pg.Pool | null} */
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      host: HOST,
      port: PORT,
      database: DATABASE,
      user: USER,
      password: getPassword(),
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}
