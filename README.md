# Field

Field workforce management — React + TypeScript web app.

```bash
npm install
npm run dev
```

Starts the Vite app (http://localhost:5173) and a local API (http://localhost:3000). The web app proxies `/api` to the API. See [`AGENTS.md`](AGENTS.md) and [`docs/sdd.md`](docs/sdd.md).

Use `npm run dev:web` or `npm run dev:api` to run either process alone.

### Database schema (RDS)

```bash
npm run db:schema
```

Applies [`db/migrations/001_initial_schema.sql`](db/migrations/001_initial_schema.sql) to `field-dev` (empty tables, no seed data). Connection details in [`.env.example`](.env.example).

### Delivery docket PDF (local)

```bash
npm run pdf:docket
```

Writes `storage/documents/delivery-docket-{taskId}.pdf` from `scripts/fixtures/sample-completed-task.json`. Layout notes: [`docs/pdf-delivery-docket.md`](docs/pdf-delivery-docket.md).

### Mobile (Capacitor)

The same Vite build runs inside a Capacitor shell (`app.field.mobile`).

```bash
npm run cap:live      # point WebView at Vite (hot reload) — emulator default
npm run cap:live -- device   # same, using this PC’s LAN IP (physical device)
npm run cap:sync      # production-style: build web → copy into android/ and ios/
npm run cap:android   # sync + open Android Studio
npm run cap:ios       # sync + open Xcode (macOS only)
```

**Live reload (day-to-day)** — Keep `npm run dev` running, then `npm run cap:live` once and Run from Android Studio. UI edits hot-reload in the emulator; no `cap:sync` per change. Physical device: `npm run cap:live -- device` (same Wi‑Fi as the PC; allow Node through Windows Firewall if prompted). To ship/test bundled assets again, run `npm run cap:sync` (clears the live-reload URL).

**Android Studio (this machine)** — Install Android Studio + an AVD (API 24+). Keep the host API up (`aws login` on this PC if RDS secrets expired, then `npm run dev`). Prefer `cap:live` for iteration, or `npm run cap:android` for a bundled build. Bundled builds reach the host API at `10.0.2.2:3000` (you do not run AWS login inside the emulator).

**Physical Android device** — Enable Developer options + USB debugging, connect the device, select it in Android Studio, Run. Live reload: `npm run cap:live -- device`. Bundled build API: `VITE_API_BASE=http://192.168.x.x:3000 npm run cap:sync`.

**iOS Simulator (iMac)** — iOS cannot be built on Windows. On the Mac: clone/pull, `npm install`, `npm run cap:sync` (runs `pod install` via CocoaPods), then `npm run cap:ios` or open `ios/App/App.xcworkspace` in Xcode. Pick an iPhone simulator → Run. For live reload on simulator, set `CAP_SERVER_URL=http://127.0.0.1:5173` before `npm run cap:live`.

If `ios/` is missing on the Mac, run `npx cap add ios` once and commit it.
