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

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deliveryDocketFileName,
  renderDeliveryDocketToFile,
} from '../server/deliveryDocket.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const fixtureArg = process.argv[2];
  const fixturePath = fixtureArg
    ? path.resolve(fixtureArg)
    : path.join(__dirname, 'fixtures', 'sample-completed-task.json');

  const raw = await readFile(fixturePath, 'utf8');
  const task = JSON.parse(raw);

  const outDir = path.join(root, 'storage', 'documents');
  await mkdir(outDir, { recursive: true });

  const outPath = path.join(
    outDir,
    deliveryDocketFileName(task.taskId ?? 'unknown'),
  );

  await renderDeliveryDocketToFile(task, outPath);
  console.log(`Wrote ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
