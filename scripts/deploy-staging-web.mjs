/**
 * Build Vite SPA and sync to staging web bucket; invalidate CloudFront.
 *
 * Requires FieldStaging stack deployed (SSM params under /field/staging/).
 * Usage: npm run web:staging
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGION = process.env.AWS_REGION || "us-west-1";

function ssm(name) {
  return execFileSync(
    "aws",
    [
      "ssm",
      "get-parameter",
      "--name",
      name,
      "--query",
      "Parameter.Value",
      "--output",
      "text",
      "--region",
      REGION,
    ],
    { encoding: "utf8" },
  ).trim();
}

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  // On Windows, npm/npx are .cmd shims — need shell for PATH resolution.
  execFileSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    shell: process.platform === "win32",
    ...opts,
  });
}

const bucket = ssm("/field/staging/web-bucket");
const distributionId = ssm("/field/staging/distribution-id");
const url = ssm("/field/staging/url");

run("npm", ["run", "build"]);
run("aws", [
  "s3",
  "sync",
  "dist/",
  `s3://${bucket}/`,
  "--delete",
  "--region",
  REGION,
]);
run("aws", [
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  distributionId,
  "--paths",
  "/*",
  "--region",
  REGION,
]);

console.log(`\nStaging web updated: ${url}`);
