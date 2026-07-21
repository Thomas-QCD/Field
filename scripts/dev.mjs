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
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 * @param {Record<string, string | undefined>} [extraEnv]
 */
function run(label, command, args, extraEnv) {
  // Avoid shell:true on Windows — cmd.exe can exit while the real process is
  // still starting, which made `dev` tear down API+Vite together.
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      console.error(`${label} exited from signal ${signal}`);
    } else {
      console.error(`${label} exited with code ${code ?? "null"}`);
    }
    shuttingDown = true;
    for (const c of children) {
      if (c !== child && c.pid && c.exitCode === null) {
        killProcessTree(c.pid);
      }
    }
    process.exit(code ?? 1);
  });
}

run("API", process.execPath, ["server/index.mjs"]);
run("Vite", process.execPath, [
  resolve(root, "node_modules/vite/bin/vite.js"),
  "--host",
  "--port",
  String(DEV_PORTS.web),
  "--strictPort",
]);

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
