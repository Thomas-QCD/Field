# Field

Field workforce management — React + TypeScript web app.

```bash
npm install
npm run dev
```

Starts the Vite app (http://localhost:5173) and a local API (http://localhost:3000). The web app proxies `/api` to the API. See [`AGENTS.md`](AGENTS.md) and [`docs/sdd.md`](docs/sdd.md).

Use `npm run dev:web` or `npm run dev:api` to run either process alone.

### Testing

```bash
npm test           # run once (CI-friendly)
npm run test:watch # watch mode while developing
npm run test:coverage
```

Vitest + Testing Library. Put tests under `tests/` as `*.test.ts` / `*.test.tsx`.

### Database schema (RDS)

```bash
npm run db:schema
```

Applies [`db/migrations/001_initial_schema.sql`](db/migrations/001_initial_schema.sql) to `field-dev` (empty tables, no seed data). Connection details in [`.env.example`](.env.example).

### Delivery docket PDF

From a task in the UI: **More actions → Print delivery docket** (`GET /api/tasks/:id/delivery-docket`).

Fixture-only CLI:

```bash
npm run pdf:docket
```

Writes `storage/documents/delivery-docket-{taskId}.pdf` and upserts `task_documents`. Layout: [`docs/pdf-delivery-docket.md`](docs/pdf-delivery-docket.md).

### Mobile (Capacitor)

The same Vite build runs inside a Capacitor shell (`app.field.mobile`).

```bash
npm run adb:virtual   # drop phone ADB + live reload via 10.0.2.2 (emulator)
npm run adb:physical  # quit emulator + live reload via LAN IP (phone)
npm run adb:unload    # clear all ADB targets (no live-reload sync)
npm run cap:live      # live reload only — emulator default (prefer adb:virtual)
npm run cap:live -- device   # live reload only — phone (prefer adb:physical)
npm run cap:sync      # production-style: build web → copy into android/ and ios/
npm run cap:android   # sync + open Android Studio
npm run cap:ios       # sync + open Xcode (macOS only)
```

**Switching devices** — Keep `npm run dev` running, then `npm run adb:virtual` or `npm run adb:physical`. That clears the other ADB target and points the Capacitor WebView at Vite. Run Field from Android Studio on the chosen device; refresh `chrome://inspect` after. To ship/test bundled assets again, run `npm run cap:sync` (clears the live-reload URL).

**Android Studio (this machine)** — Install Android Studio + an AVD (API 24+). Keep the host API up (`aws login` on this PC if RDS secrets expired, then `npm run dev`). Prefer `adb:virtual` / `adb:physical` for iteration, or `npm run cap:android` for a bundled build. Bundled builds reach the host API at `10.0.2.2:3000` (you do not run AWS login inside the emulator).

**Physical Android device** — Enable Developer options + USB debugging (or Wireless debugging), `npm run adb:physical`, select the phone in Android Studio, Run. Bundled build API: `VITE_API_BASE=http://192.168.x.x:3000 npm run cap:sync`. If attachment uploads fail after a LAN IP change, refresh S3 CORS with `npm run s3:cors`.

**iOS (Mac only)** — Full walkthrough: [`docs/ios-quickstart.md`](docs/ios-quickstart.md). Short version: clone/pull, `npm install`, configure `.env`, `npm run dev`, then `npm run cap:live -- ios` and open `ios/App/App.xcworkspace` in Xcode (or `npm run cap:ios` for a bundled build). Pick an iPhone simulator → Run.

If `ios/` is missing on the Mac, run `npx cap add ios` once and commit it.
