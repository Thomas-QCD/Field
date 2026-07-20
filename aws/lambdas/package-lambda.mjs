/**
 * Copy shared modules + install deps + zip a Lambda package.
 *
 * Usage:
 *   node aws/lambdas/package-lambda.mjs woo-message-handler
 *   node aws/lambdas/package-lambda.mjs update-modified-woo-tasks
 */
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error("Usage: node aws/lambdas/package-lambda.mjs <lambda-dir>");
  process.exit(1);
}

const src = resolve(__dirname, name);
const shared = resolve(__dirname, "_shared");
const outDir = resolve(__dirname, ".build", name);
const zipPath = resolve(__dirname, ".build", `${name}.zip`);

if (!existsSync(src)) {
  console.error(`Missing lambda dir: ${src}`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(src, outDir, { recursive: true });
cpSync(resolve(shared, "db.mjs"), resolve(outDir, "db.mjs"));
cpSync(
  resolve(shared, "persistFieldTask.mjs"),
  resolve(outDir, "persistFieldTask.mjs"),
);

execFileSync("npm", ["install", "--omit=dev"], {
  cwd: outDir,
  stdio: "inherit",
  shell: true,
});

rmSync(zipPath, { force: true });
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipPath}' -Force`,
  ],
  { stdio: "inherit" },
);

console.log(`Packaged ${zipPath}`);
