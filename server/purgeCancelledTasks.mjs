import { getPool } from "./db.mjs";

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Soft-delete Cancelled tasks whose cancelled_at is older than 7 days.
 * @returns {Promise<number>} number of tasks purged
 */
export async function purgeExpiredCancelledTasks() {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE tasks
     SET deleted_at = now(),
         updated_at = now()
     WHERE status = 'Cancelled'
       AND deleted_at IS NULL
       AND cancelled_at IS NOT NULL
       AND cancelled_at <= now() - interval '7 days'`,
  );
  return rowCount ?? 0;
}

/**
 * Run purge once, then every hour. Safe to call after the API starts listening.
 */
export function startCancelledTaskPurgeScheduler() {
  const run = () => {
    purgeExpiredCancelledTasks()
      .then((n) => {
        if (n > 0) {
          console.log(`Purged ${n} cancelled task(s) past the 7-day window`);
        }
      })
      .catch((err) => {
        console.error("Cancelled task purge failed:", err);
      });
  };

  run();
  return setInterval(run, PURGE_INTERVAL_MS);
}
