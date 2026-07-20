/**
 * Stop anything listening on Field's local API + Vite ports.
 * Usage: npm run dev:stop
 */
import { freeDevPorts, DEV_PORTS } from "./dev-ports.mjs";

const results = freeDevPorts();
let any = false;

for (const { port, pids } of results) {
  const label = port === DEV_PORTS.api ? "API" : port === DEV_PORTS.web ? "Vite" : "port";
  if (pids.length === 0) {
    console.log(`${label} :${port} — nothing listening`);
    continue;
  }
  any = true;
  console.log(`${label} :${port} — stopped PID(s) ${pids.join(", ")}`);
}

if (!any) {
  console.log("Dev ports already free.");
}
