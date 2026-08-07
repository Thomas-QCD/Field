/**
 * Automatic contact emails when a task reaches Completed or Failed.
 * Delivery completed uses order-delivered; Install/Removal/Site Survey use
 * task-completed; all four types use task-failed on Failed.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getPool } from "./db.mjs";
import { dispatchOutboundEmail } from "./emailDeliveries.mjs";
import { publicTrackingUrl } from "./publicToken.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMAILS_DIR = path.join(__dirname, "..", "emails");
const LOGO_PATH = path.join(EMAILS_DIR, "logo-white.png");

/** @type {Set<string>} */
const EMAILABLE_TYPES = new Set([
  "Delivery",
  "Install",
  "Removal",
  "Site Survey",
]);

/** @type {Record<string, string>} */
const COMPLETED_HEADLINES = {
  Install: "Your install is complete!",
  Removal: "Your removal is complete!",
  "Site Survey": "Your site survey is complete!",
};

/** @type {Record<string, string>} */
const FAILED_HEADLINES = {
  Delivery: "Your delivery could not be completed",
  Install: "Your install could not be completed",
  Removal: "Your removal could not be completed",
  "Site Survey": "Your site survey could not be completed",
};

/** @type {Map<string, string>} */
const templateCache = new Map();

let logoDataUriPromise = null;

/**
 * @returns {Promise<string>}
 */
function getLogoDataUri() {
  if (!logoDataUriPromise) {
    logoDataUriPromise = readFile(LOGO_PATH).then(
      (buf) => `data:image/png;base64,${buf.toString("base64")}`,
    );
  }
  return logoDataUriPromise;
}

/**
 * @param {string} filename
 * @returns {Promise<string>}
 */
async function loadTemplate(filename) {
  const cached = templateCache.get(filename);
  if (cached) return cached;
  const html = await readFile(path.join(EMAILS_DIR, filename), "utf8");
  templateCache.set(filename, html);
  return html;
}

/** Tracking CTA is stripped when there is no absolute URL to link to. */
const TRACKING_BLOCK = /<!--TRACKING_START-->[\s\S]*?<!--TRACKING_END-->/g;

/**
 * @param {string} html
 * @param {string} url
 */
function applyTrackingBlock(html, url) {
  return url ? html : html.replace(TRACKING_BLOCK, "");
}

/**
 * Only absolute URLs are usable in email; PUBLIC_APP_URL unset yields a path.
 * @param {unknown} token
 * @returns {string}
 */
function absoluteTrackingUrl(token) {
  const url = publicTrackingUrl(typeof token === "string" ? token : "");
  return /^https?:\/\//i.test(url) ? url : "";
}

/**
 * @param {string} html
 * @param {Record<string, string>} replacements
 */
function applyReplacements(html, replacements) {
  let out = html;
  for (const [from, to] of Object.entries(replacements)) {
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * Escape plain text for safe HTML body insertion.
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Date | string | null | undefined} value
 */
function formatCompletedAt(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * @param {number} taskId
 * @param {{ fromStatus: string; toStatus: string }} transition
 */
export async function maybeSendTerminalEmails(taskId, transition) {
  const toStatus = String(transition.toStatus || "");
  const fromStatus = String(transition.fromStatus || "");
  if (toStatus !== "Completed" && toStatus !== "Failed") return;
  if (fromStatus === toStatus) return;

  try {
    await sendTerminalEmails(taskId, toStatus);
  } catch (err) {
    console.error(
      `[taskCompletionEmails] failed for task ${taskId} → ${toStatus}:`,
      err,
    );
  }
}

/**
 * @param {number} taskId
 * @param {'Completed' | 'Failed'} toStatus
 */
async function sendTerminalEmails(taskId, toStatus) {
  const pool = getPool();
  const taskResult = await pool.query(
    `SELECT t.id,
            t.task_type,
            t.job_title,
            t.completed_at,
            t.failed_reason,
            t.public_token,
            a.address_name AS destination_name
     FROM tasks t
     LEFT JOIN addresses a ON a.id = t.destination_address_id
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [taskId],
  );
  const task = taskResult.rows[0];
  if (!task) return;

  const taskType = String(task.task_type);
  if (!EMAILABLE_TYPES.has(taskType)) return;

  if (toStatus === "Completed" && taskType !== "Delivery" && !COMPLETED_HEADLINES[taskType]) {
    return;
  }
  if (toStatus === "Failed" && !FAILED_HEADLINES[taskType]) {
    return;
  }

  const recipients = await pool.query(
    `SELECT c.id, c.name, c.email
     FROM task_contacts tc
     JOIN contacts c ON c.id = tc.contact_id
     WHERE tc.task_id = $1
       AND tc.receives_email = true
       AND c.email IS NOT NULL
       AND btrim(c.email) <> ''`,
    [taskId],
  );
  if (recipients.rows.length === 0) return;

  const logoDataUri = await getLogoDataUri();
  const completedAt = formatCompletedAt(task.completed_at);
  const jobTitle =
    (task.job_title && String(task.job_title).trim()) || `Task #${taskId}`;
  const destinationName =
    (task.destination_name && String(task.destination_name).trim()) ||
    "your destination";
  const failedReason =
    (task.failed_reason && String(task.failed_reason).trim()) ||
    "No reason provided";
  const trackingUrl = absoluteTrackingUrl(task.public_token);
  if (!trackingUrl) {
    console.warn(
      `[taskCompletionEmails] task ${taskId}: no tracking link in email (set PUBLIC_APP_URL)`,
    );
  }

  /** @type {string} */
  let templateFile;
  /** @type {string} */
  let trigger;
  /** @type {string} */
  let subject;
  /** @type {string} */
  let headline;

  if (toStatus === "Completed" && taskType === "Delivery") {
    templateFile = "order-delivered.html";
    trigger = "task_completed";
    subject = "Your order has been delivered!";
    headline = subject;
  } else if (toStatus === "Completed") {
    templateFile = "task-completed.html";
    trigger = "task_completed";
    headline = COMPLETED_HEADLINES[taskType];
    subject = headline;
  } else {
    templateFile = "task-failed.html";
    trigger = "task_failed";
    headline = FAILED_HEADLINES[taskType];
    subject = headline;
  }

  const templateHtml = applyTrackingBlock(
    await loadTemplate(templateFile),
    trackingUrl,
  );

  for (const row of recipients.rows) {
    const email = String(row.email).trim();
    const contactName =
      (row.name && String(row.name).trim()) || "there";

    const replacements = {
      "{{contact_name}}": escapeHtml(contactName),
      "{{job_title}}": escapeHtml(jobTitle),
      "{{destination_name}}": escapeHtml(destinationName),
      "{{completed_at}}": escapeHtml(completedAt),
      "{{headline}}": escapeHtml(headline),
      "{{task_type}}": escapeHtml(taskType),
      "{{failed_reason}}": escapeHtml(failedReason),
      "{{tracking_url}}": escapeHtml(trackingUrl),
      'src="logo-white.png"': `src="${logoDataUri}"`,
    };

    const html = applyReplacements(templateHtml, replacements);

    /** @type {string[]} */
    const textLines = [headline, "", `Task: ${jobTitle}`];
    if (toStatus !== "Completed" || taskType !== "Delivery") {
      textLines.push(`Type: ${taskType}`);
    }
    textLines.push(
      toStatus === "Completed" && taskType === "Delivery"
        ? `Delivered to: ${destinationName}`
        : `Location: ${destinationName}`,
    );
    if (toStatus === "Failed") {
      textLines.push(`Reason: ${failedReason}`);
    }
    if (trackingUrl) {
      textLines.push("", `Track this task: ${trackingUrl}`);
    }
    textLines.push("", "Thanks for choosing Quick Change Display.");
    const text = textLines.join("\n");

    const result = await dispatchOutboundEmail({
      taskId,
      trigger,
      to: email,
      subject,
      text,
      html,
    });
    if (result.status !== "sent") {
      console.error(
        `[taskCompletionEmails] send failed task=${taskId} to=${email}:`,
        result.errorMessage,
      );
    }
  }
}
