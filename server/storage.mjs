import { randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION || "us-west-1";
const BUCKET = process.env.S3_BUCKET || "field-dev-attachments";

/** @type {S3Client | null} */
let client = null;

function getClient() {
  if (!client) {
    client = new S3Client({ region: REGION });
  }
  return client;
}

/**
 * @param {string} fileName
 */
export function sanitizeFileName(fileName) {
  const base = String(fileName || "file")
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\- ()+]/g, "_")
    .trim();
  const cleaned = base.replace(/^\.+/, "") || "file";
  return cleaned.slice(0, 180);
}

/**
 * @param {number} taskId
 * @param {string} fileName
 */
export function buildAttachmentStorageKey(taskId, fileName) {
  const safe = sanitizeFileName(fileName);
  return `attachments/${taskId}/${randomUUID()}-${safe}`;
}

/**
 * @param {number} taskId
 * @param {string} storageKey
 */
export function isValidAttachmentKeyForTask(taskId, storageKey) {
  const prefix = `attachments/${taskId}/`;
  return (
    typeof storageKey === "string" &&
    storageKey.startsWith(prefix) &&
    !storageKey.includes("..") &&
    storageKey.length <= 500
  );
}

/**
 * @param {{ storageKey: string, mimeType: string, expiresIn?: number }} opts
 */
export async function presignPut({ storageKey, mimeType, expiresIn = 900 }) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn });
  return { uploadUrl, storageKey, bucket: BUCKET };
}

/**
 * @param {{ storageKey: string, fileName?: string | null, disposition?: 'inline' | 'attachment', contentType?: string | null, expiresIn?: number }} opts
 */
export async function presignGet({
  storageKey,
  fileName = null,
  disposition = "attachment",
  contentType = null,
  expiresIn = 300,
}) {
  /** @type {import('@aws-sdk/client-s3').GetObjectCommandInput} */
  const input = {
    Bucket: BUCKET,
    Key: storageKey,
  };
  if (fileName) {
    const safe = sanitizeFileName(fileName);
    const mode = disposition === "inline" ? "inline" : "attachment";
    input.ResponseContentDisposition = `${mode}; filename="${safe}"`;
  }
  if (contentType) {
    input.ResponseContentType = contentType;
  }
  const command = new GetObjectCommand(input);
  const downloadUrl = await getSignedUrl(getClient(), command, { expiresIn });
  return { downloadUrl, expiresIn };
}

/**
 * Download an S3 object for server-side processing.
 * @param {string} storageKey
 */
export async function getObjectBuffer(storageKey) {
  const result = await getClient().send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    }),
  );
  if (!result.Body) {
    throw new Error(`S3 object has no body: ${storageKey}`);
  }
  return Buffer.from(await result.Body.transformToByteArray());
}

/**
 * @param {string} storageKey
 */
export async function deleteObject(storageKey) {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    }),
  );
}

/**
 * Server-side copy within the attachments bucket (e.g. task clone).
 *
 * @param {string} sourceKey
 * @param {string} destKey
 */
export async function copyObject(sourceKey, destKey) {
  const encodedSourceKey = sourceKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  await getClient().send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${encodedSourceKey}`,
      Key: destKey,
    }),
  );
}
