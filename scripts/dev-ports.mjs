/**
 * Shared helpers for Field local dev ports (API + Vite).
 */
import { execFileSync } from "node:child_process";

export const DEV_PORTS = Object.freeze({
  api: Number(process.env.API_PORT) || 3000,
  web: Number(process.env.VITE_PORT) || 5173,
});

/** @returns {number[]} */
export function allDevPorts() {
  return [DEV_PORTS.api, DEV_PORTS.web];
}

/**
 * @param {number} port
 * @returns {number[]}
 */
function pidsListeningOnPort(port) {
  if (process.platform === "win32") {
    let stdout = "";
    try {
      stdout = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique`,
        ],
        { encoding: "utf8" },
      );
    } catch {
      return [];
    }
    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      ),
    ];
  }

  try {
    const stdout = execFileSync("lsof", ["-ti", `tcp:${port}`], {
      encoding: "utf8",
    });
    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * Kill a process and its children (Windows process trees leave orphans otherwise).
 * @param {number} pid
 */
export function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* already gone or access denied */
  }
}

/**
 * Free Field's local API + Vite ports. Safe to call when nothing is listening.
 * @param {number[]} [ports]
 * @returns {{ port: number, pids: number[] }[]}
 */
export function freeDevPorts(ports = allDevPorts()) {
  /** @type {{ port: number, pids: number[] }[]} */
  const results = [];
  const killed = new Set();

  for (const port of ports) {
    const pids = pidsListeningOnPort(port).filter((pid) => !killed.has(pid));
    for (const pid of pids) {
      killProcessTree(pid);
      killed.add(pid);
    }
    results.push({ port, pids });
  }

  return results;
}
