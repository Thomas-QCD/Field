/**
 * Start API + Vite together for local development.
 * Frees known ports first so orphaned agent-started servers do not block startup.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DEV_PORTS, freeDevPorts, killProcessTree } from "./dev-ports.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const freed = freeDevPorts();
for (const { port, pids } of freed) {
  if (pids.length > 0) {
    const label = port === DEV_PORTS.api ? "API" : "Vite";
    console.log(`Freed ${label} :${port} (was PID ${pids.join(", ")})`);
  }
}

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

/**
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string | undefined>} [extraEnv]
 */
function run(command, args, extraEnv) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown || signal) return;
    shuttingDown = true;
    for (const c of children) {
      if (c !== child && c.pid && c.exitCode === null) {
        killProcessTree(c.pid);
      }
    }
    process.exit(code ?? 1);
  });
}

run("node", ["server/index.mjs"]);
run("npx", ["vite", "--port", String(DEV_PORTS.web), "--strictPort"]);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (c.pid && c.exitCode === null) {
      killProcessTree(c.pid);
    }
  }
  // Catch anything still bound (Windows shell grandchildren).
  freeDevPorts();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
