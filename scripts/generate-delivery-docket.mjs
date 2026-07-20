/**
 * Generate a delivery docket PDF from a JSON fixture.
 *
 * Usage:
 *   npm run pdf:docket
 *   node scripts/generate-delivery-docket.mjs [path-to-fixture.json]
 *
 * Output: storage/documents/delivery-docket-{taskId}.pdf
 *
 * Layout: docs/pdf-delivery-docket.md
 */

import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const LABEL_WIDTH = 110;
const MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function display(value) {
  if (value == null || String(value).trim() === '') return 'n/a';
  return String(value);
}

/** Jul 15 2026 01:09 PM */
function formatBodyDate(iso) {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n/a';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/** 2026-07-15 14:11 */
function formatFooterDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function drawRow(doc, label, value, y) {
  const x = MARGIN;
  doc.font('Helvetica').fontSize(10).fillColor('#333333');
  doc.text(label, x, y, { width: LABEL_WIDTH, lineBreak: false });
  const valueX = x + LABEL_WIDTH;
  const valueWidth = CONTENT_WIDTH - LABEL_WIDTH;
  doc.font('Helvetica').fontSize(10).fillColor('#000000');
  doc.text(display(value), valueX, y, { width: valueWidth });
  return doc.y + 4;
}

function drawSectionTitle(doc, title, y) {
  doc.moveDown(0.4);
  const top = Math.max(y, doc.y);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
  doc.text(title, MARGIN, top, { width: CONTENT_WIDTH });
  return doc.y + 8;
}

function drawUnderlineField(doc, label, width, x, y) {
  doc.font('Helvetica').fontSize(10).fillColor('#333333');
  doc.text(label, x, y, { lineBreak: false });
  const labelW = doc.widthOfString(label) + 6;
  const lineY = y + 12;
  doc
    .moveTo(x + labelW, lineY)
    .lineTo(x + width, lineY)
    .strokeColor('#000000')
    .lineWidth(0.5)
    .stroke();
}

/**
 * @param {Record<string, unknown>} task
 * @param {string} outPath
 */
function renderDocket(task, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `Delivery Docket ${task.taskId}`,
        Author: String(task.companyName ?? 'Field'),
      },
    });

    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    let y = MARGIN;

    // Header: Task ID + optional Completed on
    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    doc.text(`Task ID: ${display(task.taskId)}`, MARGIN, y, {
      width: CONTENT_WIDTH / 2,
      lineBreak: false,
    });
    if (task.completedAt) {
      doc.text(`Completed on ${formatBodyDate(task.completedAt)}`, MARGIN, y, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    }
    y = doc.y + 14;

    // Title
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000');
    doc.text('Delivery Docket', MARGIN, y);
    y = doc.y + 12;

    y = drawRow(doc, 'Company', task.companyName, y);
    y += 8;

    // Destination Location
    y = drawSectionTitle(doc, 'Destination Location', y);
    y = drawRow(doc, 'Contact', task.contactName, y);
    y = drawRow(doc, 'Address', task.destinationAddress, y);
    y = drawRow(doc, 'Building', task.destinationBuilding, y);
    y = drawRow(doc, 'Email', task.contactEmail, y);
    y = drawRow(doc, 'Phone', task.contactPhone, y);
    y = drawRow(doc, 'Instructions', task.destinationNotes, y);
    y += 8;

    // Summary
    y = drawSectionTitle(doc, 'Summary', y);
    y = drawRow(doc, 'External ID', task.externalKey, y);
    y = drawRow(doc, 'Type', task.taskType, y);
    y = drawRow(doc, 'Priority', task.priority ?? 'Normal', y);
    y = drawRow(doc, 'Crew', task.crewName, y);
    y = drawRow(doc, 'Status', task.status, y);
    y = drawRow(doc, 'Created', formatBodyDate(task.createdAt), y);
    y += 8;

    // Description
    y = drawSectionTitle(doc, 'Description', y);
    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    doc.text(display(task.taskDesc), MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 12;

    // POD
    y = drawSectionTitle(doc, 'POD', y);
    const receivedParts = [];
    if (task.receivedByName) receivedParts.push(String(task.receivedByName));
    if (task.completedAt) receivedParts.push(formatBodyDate(task.completedAt));
    const receivedBy =
      receivedParts.length > 0 ? receivedParts.join(' , ') : null;
    y = drawRow(doc, 'Received by', receivedBy, y);
    y = drawRow(doc, 'Notes', task.completedNotes, y);
    y += 16;

    // Signature lines
    const sigY = y;
    const colW = CONTENT_WIDTH / 3;
    drawUnderlineField(doc, 'Name', colW - 12, MARGIN, sigY);
    drawUnderlineField(doc, 'Signature', colW - 12, MARGIN + colW, sigY);
    drawUnderlineField(doc, 'Date', colW - 12, MARGIN + colW * 2, sigY);

    // Footer
    const footerY = doc.page.height - MARGIN - 12;
    const generated = `Generated by ${display(task.companyName)} on ${formatFooterDate()}`;
    doc.font('Helvetica').fontSize(8).fillColor('#555555');
    doc.text(generated, MARGIN, footerY, {
      width: CONTENT_WIDTH - 40,
      lineBreak: false,
    });
    doc.text('1 / 1', MARGIN, footerY, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

    doc.end();
  });
}

async function main() {
  const fixtureArg = process.argv[2];
  const fixturePath = fixtureArg
    ? path.resolve(fixtureArg)
    : path.join(__dirname, 'fixtures', 'sample-completed-task.json');

  const raw = await readFile(fixturePath, 'utf8');
  const task = JSON.parse(raw);

  const outDir = path.join(root, 'storage', 'documents');
  await mkdir(outDir, { recursive: true });

  const safeId = String(task.taskId ?? 'unknown').replace(/[^\w-]+/g, '_');
  const outPath = path.join(outDir, `delivery-docket-${safeId}.pdf`);

  await renderDocket(task, outPath);
  console.log(`Wrote ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
