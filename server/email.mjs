/**
 * Outbound email provider — SES (default) or console (offline).
 * Env: EMAIL_PROVIDER, EMAIL_FROM, EMAIL_CONFIGURATION_SET, AWS_REGION
 */

import { randomUUID } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const REGION = process.env.AWS_REGION || "us-west-1";
const DEFAULT_FROM = "noreply@qcdlv.net";
const DEFAULT_CONFIG_SET = "notify_on_error";

/** @type {SESv2Client | null} */
let client = null;

function getClient() {
  if (!client) {
    client = new SESv2Client({ region: REGION });
  }
  return client;
}

function getProvider() {
  const raw = (process.env.EMAIL_PROVIDER || "ses").trim().toLowerCase();
  return raw === "console" ? "console" : "ses";
}

export function getEmailFrom() {
  return (process.env.EMAIL_FROM || DEFAULT_FROM).trim() || DEFAULT_FROM;
}

function getConfigurationSet() {
  const raw = process.env.EMAIL_CONFIGURATION_SET;
  if (raw === "") return null;
  return (raw ?? DEFAULT_CONFIG_SET).trim() || null;
}

/**
 * @param {string | string[]} to
 * @returns {string[]}
 */
function normalizeTo(to) {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((a) => String(a || "").trim())
    .filter(Boolean);
}

/**
 * @param {{
 *   to: string | string[];
 *   subject: string;
 *   text: string;
 *   html?: string;
 *   replyTo?: string | string[];
 * }} opts
 * @returns {Promise<{ messageId: string }>}
 */
export async function sendEmail(opts) {
  const toAddresses = normalizeTo(opts.to);
  if (toAddresses.length === 0) {
    throw new Error("sendEmail: at least one To address is required");
  }
  const subject = String(opts.subject || "").trim();
  if (!subject) {
    throw new Error("sendEmail: subject is required");
  }
  const text = String(opts.text ?? "");
  const from = getEmailFrom();
  const provider = getProvider();

  if (provider === "console") {
    const messageId = `console-${randomUUID()}`;
    console.log("[email:console]", {
      messageId,
      from,
      to: toAddresses,
      subject,
      text,
      html: opts.html ?? null,
      replyTo: opts.replyTo ?? null,
    });
    return { messageId };
  }

  const replyTo = opts.replyTo
    ? normalizeTo(opts.replyTo)
    : undefined;
  const configurationSetName = getConfigurationSet();

  /** @type {import("@aws-sdk/client-sesv2").SendEmailCommandInput} */
  const input = {
    FromEmailAddress: from,
    Destination: { ToAddresses: toAddresses },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          ...(opts.html
            ? { Html: { Data: String(opts.html), Charset: "UTF-8" } }
            : {}),
        },
      },
    },
    ...(replyTo?.length ? { ReplyToAddresses: replyTo } : {}),
    ...(configurationSetName
      ? { ConfigurationSetName: configurationSetName }
      : {}),
  };

  const result = await getClient().send(new SendEmailCommand(input));
  const messageId = result.MessageId;
  if (!messageId) {
    throw new Error("SES SendEmail returned no MessageId");
  }
  return { messageId };
}
