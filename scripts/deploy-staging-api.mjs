/**
 * Build/push API image to staging ECR and (re)deploy ECS service (desired count 1).
 *
 * Requires FieldStaging stack deployed (SSM params under /field/staging/).
 * Usage: npm run api:staging
 *
 * Needs Docker running locally.
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

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    shell: process.platform === "win32",
  });
}

const ecrUri = ssm("/field/staging/ecr-uri");
const cluster = ssm("/field/staging/cluster-name");
const service = ssm("/field/staging/service-name");
const url = ssm("/field/staging/url");

const registry = ecrUri.split("/")[0];

const password = execFileSync(
  "aws",
  ["ecr", "get-login-password", "--region", REGION],
  { encoding: "utf8" },
).trim();

execFileSync(
  "docker",
  ["login", "--username", "AWS", "--password-stdin", registry],
  {
    input: password,
    stdio: ["pipe", "inherit", "inherit"],
    cwd: ROOT,
  },
);

const imageTag = `${ecrUri}:latest`;
run("docker", ["build", "-t", imageTag, "."]);
run("docker", ["push", imageTag]);

run("aws", [
  "ecs",
  "update-service",
  "--cluster",
  cluster,
  "--service",
  service,
  "--desired-count",
  "1",
  "--force-new-deployment",
  "--region",
  REGION,
]);

console.log(`\nAPI image pushed: ${imageTag}`);
console.log(`ECS service ${service} set to desiredCount=1 (new deployment).`);
console.log(`Health check: ${url}/api/health`);
console.log(`(region ${REGION})`);
