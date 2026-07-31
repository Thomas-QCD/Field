# Field

Field workforce management — React + TypeScript web app.

## Scripts you need

| When | Command |
|------|---------|
| Day-to-day web | `npm run dev` → http://localhost:5173 (API `:3000`) |
| Stop servers | `npm run dev:stop` |
| Tests | `npm test` / `npm run test:watch` |
| Android live reload | `npm run adb:virtual` or `adb:physical` (keep `dev` running) |
| iOS live reload | `npm run cap:live -- ios` |
| Bundled Cap build | `npm run cap:sync` · open with `cap:android` / `cap:ios` |
| Cap → staging API | `npm run cap:staging` |

Everything else (`db:*`, `pdf:docket`, `email:test`, `s3:cors`, `infra:*`, `*:staging`) is occasional — see sections below or run `node scripts/<name>.mjs` directly. Removed npm aliases: `npx vite`, `node server/index.mjs`, `npx vitest run --coverage`, `node scripts/adb-unload.mjs`, `node scripts/apk-serve.mjs`.

```bash
npm install
npm run dev
```

The web app proxies `/api` to the API. See [`AGENTS.md`](AGENTS.md) and [`docs/sdd.md`](docs/sdd.md).

### Testing

```bash
npm test           # run once (CI-friendly)
npm run test:watch # watch mode while developing
```

Vitest + Testing Library. Put tests under `tests/` as `*.test.ts` / `*.test.tsx`.

### Database schema (RDS)

```bash
npm run db:schema
```

Applies [`db/migrations/001_initial_schema.sql`](db/migrations/001_initial_schema.sql) to `field-dev` (empty tables, no seed data). Connection details in [`.env.example`](.env.example).

Manual RDS master-password rotate (also redeploys staging ECS + recycles Wodely Lambdas):

```bash
npm run db:rotate-secret
```

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
npm run cap:live -- ios   # iOS Simulator live reload (see ios-quickstart)
npm run cap:sync      # production-style: build web → copy into android/ and ios/ (local API)
npm run cap:staging   # same, but API = staging CloudFront (SSM /field/staging/url)
npm run apk:staging   # signed release APK → staging (needs android:keystore once)
npm run cap:android   # sync (local API) + open Android Studio
npm run cap:ios       # sync (local API) + open Xcode (macOS only)
```

**Staging API on device** — `npm run cap:staging` (optionally `-- --open android`) for IDE runs, or `npm run apk:staging` / `-- --serve` for a signed sideload APK. Do not follow `cap:staging` with `cap:android` / `cap:ios` or you lose the staging URL. Details: [`docs/staging.md`](docs/staging.md).

**Release signing (once)** — `FIELD_KEYSTORE_PASSWORD='…' npm run android:keystore` creates `android/keystore/field-release.jks` (gitignored). Back it up; losing it blocks updates to the same sideloaded app.

**Switching devices** — Keep `npm run dev` running, then `npm run adb:virtual` or `npm run adb:physical`. That clears the other ADB target and points the Capacitor WebView at Vite. Run Field from Android Studio on the chosen device; refresh `chrome://inspect` after. To ship/test bundled assets again, run `npm run cap:sync` (clears the live-reload URL; local API). Clear ADB targets only: `node scripts/adb-unload.mjs`.

**Android Studio (this machine)** — Install Android Studio + an AVD (API 24+). Keep the host API up (`aws login` on this PC if RDS secrets expired, then `npm run dev`). Prefer `adb:virtual` / `adb:physical` for iteration, or `npm run cap:android` for a bundled build. Bundled builds reach the host API at `10.0.2.2:3000` (you do not run AWS login inside the emulator).

**Physical Android device** — Enable Developer options + USB debugging (or Wireless debugging), `npm run adb:physical`, select the phone in Android Studio, Run. Bundled build API: `VITE_API_BASE=http://192.168.x.x:3000 npm run cap:sync`. If attachment uploads fail after a LAN IP change, refresh S3 CORS with `npm run s3:cors`.

**iOS (Mac only)** — Full walkthrough: [`docs/ios-quickstart.md`](docs/ios-quickstart.md). Short version: clone/pull, `npm install`, configure `.env`, `npm run dev`, then `npm run cap:live -- ios` and open `ios/App/App.xcworkspace` in Xcode (or `npm run cap:ios` for a bundled build). Pick an iPhone simulator → Run.

If `ios/` is missing on the Mac, run `npx cap add ios` once and commit it.

### Staging (AWS)

Generic CloudFront URL (no custom DNS). CDK under `infra/` — **do not deploy until approved**. Runbook: [`docs/staging.md`](docs/staging.md).
