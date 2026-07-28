/**
 * Outbound email dispatch with email_deliveries audit log.
 */

import { getPool } from "./db.mjs";
import { sendEmail } from "./email.mjs";

/**
 * @param {string | string[]} to
 * @returns {string}
 */
function formatToAddresses(to) {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((a) => String(a || "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Insert pending → send via provider → update sent | failed.
 *
 * @param {{
 *   taskId: number;
 *   trigger: string;
 *   to: string | string[];
 *   subject: string;
 *   text: string;
 *   html?: string;
 *   replyTo?: string | string[];
 * }} opts
 * @returns {Promise<{
 *   id: number;
 *   taskId: number;
 *   trigger: string;
 *   toAddresses: string;
 *   subject: string;
 *   status: string;
 *   providerMessageId: string | null;
 *   errorMessage: string | null;
 *   sentAt: string | null;
 *   createdAt: string;
 * }>}
 */
export async function dispatchOutboundEmail(opts) {
  const taskId = Number(opts.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new Error("dispatchOutboundEmail: taskId must be a positive integer");
  }
  const trigger = String(opts.trigger || "").trim();
  if (!trigger) {
    throw new Error("dispatchOutboundEmail: trigger is required");
  }
  const toAddresses = formatToAddresses(opts.to);
  if (!toAddresses) {
    throw new Error("dispatchOutboundEmail: at least one To address is required");
  }
  const subject = String(opts.subject || "").trim();
  if (!subject) {
    throw new Error("dispatchOutboundEmail: subject is required");
  }

  const pool = getPool();
  const insert = await pool.query(
    `INSERT INTO email_deliveries (task_id, "trigger", to_addresses, subject, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id, task_id, "trigger", to_addresses, subject, status,
               provider_message_id, error_message, sent_at, created_at`,
    [taskId, trigger, toAddresses, subject],
  );
  const row = insert.rows[0];
  const id = row.id;

  try {
    const { messageId } = await sendEmail({
      to: opts.to,
      subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    const updated = await pool.query(
      `UPDATE email_deliveries
       SET status = 'sent',
           provider_message_id = $2,
           sent_at = now(),
           error_message = NULL
       WHERE id = $1
       RETURNING id, task_id, "trigger", to_addresses, subject, status,
                 provider_message_id, error_message, sent_at, created_at`,
      [id, messageId],
    );
    return mapRow(updated.rows[0]);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? "send failed");
    const updated = await pool.query(
      `UPDATE email_deliveries
       SET status = 'failed',
           error_message = $2
       WHERE id = $1
       RETURNING id, task_id, "trigger", to_addresses, subject, status,
                 provider_message_id, error_message, sent_at, created_at`,
      [id, message.slice(0, 4000)],
    );
    return mapRow(updated.rows[0]);
  }
}

/**
 * @param {Record<string, unknown>} row
 */
function mapRow(row) {
  return {
    id: Number(row.id),
    taskId: Number(row.task_id),
    trigger: String(row.trigger),
    toAddresses: String(row.to_addresses),
    subject: String(row.subject),
    status: String(row.status),
    providerMessageId: row.provider_message_id
      ? String(row.provider_message_id)
      : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
