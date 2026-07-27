/**
 * Delivery docket PDF — shared by API and `npm run pdf:docket`.
 * Layout: docs/pdf-delivery-docket.md
 */

import PDFDocument from "pdfkit";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LABEL_WIDTH = 110;
const MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LOGO_PATH = path.join(root, "public", "logoColor.png");
const LOGO_HEIGHT = 42;
const LOGO_WIDTH = LOGO_HEIGHT * (399 / 158);
const DOCUMENTS_DIR = path.join(root, "storage", "documents");
const KIND = "delivery_docket";

function companyName() {
  return (process.env.COMPANY_NAME ?? "Quick Change Display").trim() || "Quick Change Display";
}

/** Normalize Windows/Wodely line endings so CR is not drawn as a glyph (Ð). */
function normalizeText(value) {
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function display(value) {
  if (value == null || String(value).trim() === "") return "n/a";
  return normalizeText(value);
}

/** Jul 15 2026 01:09 PM */
function formatBodyDate(iso) {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

/** 2026-07-15 14:11 */
function formatFooterDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function drawRow(doc, label, value, y) {
  const x = MARGIN;
  doc.font("Helvetica").fontSize(10).fillColor("#333333");
  doc.text(label, x, y, { width: LABEL_WIDTH, lineBreak: false });
  const valueX = x + LABEL_WIDTH;
  const valueWidth = CONTENT_WIDTH - LABEL_WIDTH;
  doc.font("Helvetica").fontSize(10).fillColor("#000000");
  doc.text(display(value), valueX, y, { width: valueWidth });
  return doc.y + 4;
}

function drawSectionTitle(doc, title, y) {
  doc.moveDown(0.4);
  const top = Math.max(y, doc.y);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000");
  doc.text(title, MARGIN, top, { width: CONTENT_WIDTH });
  return doc.y + 8;
}

function drawUnderlineField(doc, label, width, x, y) {
  doc.font("Helvetica").fontSize(10).fillColor("#333333");
  doc.text(label, x, y, { lineBreak: false });
  const labelW = doc.widthOfString(label) + 6;
  const lineY = y + 12;
  doc
    .moveTo(x + labelW, lineY)
    .lineTo(x + width, lineY)
    .strokeColor("#000000")
    .lineWidth(0.5)
    .stroke();
}

/**
 * Map API/DB task detail → docket fixture shape.
 * @param {Record<string, unknown>} task
 */
export function taskToDocketInput(task) {
  const contacts = Array.isArray(task.contacts) ? task.contacts : [];
  const poc =
    contacts.find((c) => c && c.isPoc) ??
    contacts[0] ??
    null;

  const crewMembers = Array.isArray(task.crewMembers) ? task.crewMembers : [];
  const crewName =
    crewMembers
      .map((m) => (m && m.displayName ? String(m.displayName).trim() : ""))
      .filter(Boolean)
      .join(", ") ||
    (typeof task.crewName === "string" ? task.crewName : null);

  const completionNotesByName =
    typeof task.completionNotesByName === "string" &&
    task.completionNotesByName.trim()
      ? task.completionNotesByName.trim()
      : null;

  return {
    taskId: task.id,
    companyName: companyName(),
    completedAt: task.completedAt ?? null,
    destinationAddressName: task.destinationAddressName ?? null,
    contactName: poc?.name ?? null,
    destinationAddress: task.destinationAddress ?? null,
    destinationBuilding: task.destinationBuilding ?? null,
    contactEmail: poc?.email ?? null,
    contactPhone: poc?.phone ?? null,
    externalKey: task.externalKey ?? null,
    taskType: task.taskType ?? null,
    crewName,
    status: task.status ?? null,
    createdAt: task.createdAt ?? null,
    taskDesc: task.description ?? task.taskDesc ?? null,
    receivedByName: completionNotesByName,
    completedNotes: task.completedNotes ?? null,
  };
}

/**
 * @param {Record<string, unknown>} docket
 * @returns {Promise<Buffer>}
 */
export function renderDeliveryDocketBuffer(docket) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `Delivery Docket ${docket.taskId}`,
        Author: String(docket.companyName ?? companyName()),
      },
    });

    /** @type {Buffer[]} */
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;

    doc.image(LOGO_PATH, MARGIN, y, {
      width: LOGO_WIDTH,
      height: LOGO_HEIGHT,
    });

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000000");
    const titleH = doc.currentLineHeight();
    doc.text("Delivery Docket", MARGIN, y + (LOGO_HEIGHT - titleH) / 2, {
      width: CONTENT_WIDTH,
      align: "right",
      lineBreak: false,
    });
    y = MARGIN + LOGO_HEIGHT + 14;

    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    const idLine = `Task ID: ${display(docket.taskId)}    External ID: ${display(docket.externalKey)}`;
    doc.text(idLine, MARGIN, y, {
      width: CONTENT_WIDTH / 2,
      lineBreak: false,
    });
    if (docket.completedAt) {
      doc.text(`Completed on ${formatBodyDate(docket.completedAt)}`, MARGIN, y, {
        width: CONTENT_WIDTH,
        align: "right",
      });
    }
    y = doc.y + 12;

    y = drawSectionTitle(doc, "Destination Location", y);
    y = drawRow(doc, "Location", docket.destinationAddressName, y);
    y = drawRow(doc, "Contact", docket.contactName, y);
    y = drawRow(doc, "Address", docket.destinationAddress, y);
    y = drawRow(doc, "Building", docket.destinationBuilding, y);
    y = drawRow(doc, "Email", docket.contactEmail, y);
    y = drawRow(doc, "Phone", docket.contactPhone, y);
    y += 8;

    y = drawSectionTitle(doc, "Summary", y);
    y = drawRow(doc, "Type", docket.taskType, y);
    y = drawRow(doc, "Crew", docket.crewName, y);
    y = drawRow(doc, "Status", docket.status, y);
    y = drawRow(doc, "Created", formatBodyDate(docket.createdAt), y);
    y += 8;

    y = drawSectionTitle(doc, "Description", y);
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text(display(docket.taskDesc), MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 12;

    y = drawSectionTitle(doc, "POD", y);
    const receivedParts = [];
    if (docket.receivedByName) receivedParts.push(String(docket.receivedByName));
    if (docket.completedAt) receivedParts.push(formatBodyDate(docket.completedAt));
    const receivedBy =
      receivedParts.length > 0 ? receivedParts.join(" , ") : null;
    y = drawRow(doc, "Received by", receivedBy, y);
    y = drawRow(doc, "Notes", docket.completedNotes, y);
    y += 16;

    const sigY = y;
    const colW = CONTENT_WIDTH / 3;
    drawUnderlineField(doc, "Name", colW - 12, MARGIN, sigY);
    drawUnderlineField(doc, "Signature", colW - 12, MARGIN + colW, sigY);
    drawUnderlineField(doc, "Date", colW - 12, MARGIN + colW * 2, sigY);

    const footerY = doc.page.height - MARGIN - 12;
    const generated = `Generated by ${display(docket.companyName)} on ${formatFooterDate()}`;
    doc.font("Helvetica").fontSize(8).fillColor("#555555");
    doc.text(generated, MARGIN, footerY, {
      width: CONTENT_WIDTH - 40,
      lineBreak: false,
    });
    doc.text("1 / 1", MARGIN, footerY, {
      width: CONTENT_WIDTH,
      align: "right",
    });

    doc.end();
  });
}

/**
 * @param {Record<string, unknown>} docket
 * @param {string} outPath
 */
export async function renderDeliveryDocketToFile(docket, outPath) {
  const buf = await renderDeliveryDocketBuffer(docket);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return outPath;
}

/**
 * @param {number} taskId
 */
export function deliveryDocketFileName(taskId) {
  const safeId = String(taskId).replace(/[^\w-]+/g, "_");
  return `delivery-docket-${safeId}.pdf`;
}

/**
 * @param {number} taskId
 */
export function deliveryDocketStorageKey(taskId) {
  return `documents/${deliveryDocketFileName(taskId)}`;
}

/**
 * Generate PDF for a task, write under storage/documents, upsert task_documents.
 * @param {Record<string, unknown>} task API task detail
 * @param {{ generatedByUserId?: string | null }} [opts]
 */
export async function generateAndStoreDeliveryDocket(task, opts = {}) {
  const taskId = Number(task.id);
  if (!Number.isFinite(taskId)) {
    throw Object.assign(new Error("Invalid task id"), { status: 400 });
  }

  const docket = taskToDocketInput(task);
  const fileName = deliveryDocketFileName(taskId);
  const storageKey = deliveryDocketStorageKey(taskId);
  const outPath = path.join(DOCUMENTS_DIR, fileName);
  const buf = await renderDeliveryDocketBuffer(docket);

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  await writeFile(outPath, buf);

  const generatedBy =
    typeof opts.generatedByUserId === "string" && opts.generatedByUserId.trim()
      ? opts.generatedByUserId.trim()
      : null;

  const pool = getPool();
  await pool.query(
    `INSERT INTO task_documents (
       task_id, kind, storage_key, file_name, generated_at, generated_by_user_id
     ) VALUES ($1, $2, $3, $4, now(), $5::uuid)
     ON CONFLICT (task_id, kind) DO UPDATE SET
       storage_key = EXCLUDED.storage_key,
       file_name = EXCLUDED.file_name,
       generated_at = EXCLUDED.generated_at,
       generated_by_user_id = EXCLUDED.generated_by_user_id`,
    [taskId, KIND, storageKey, fileName, generatedBy],
  );

  return { buffer: buf, fileName, storageKey, outPath };
}
