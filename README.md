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

The same Vite build runs inside a Capacitor shell (`app.field.mobile`). Native builds show a **Hello Field — Android/iOS** banner so you can confirm the WebView.

```bash
npm run cap:sync      # build web → copy into android/ and ios/
npm run cap:android   # sync + open Android Studio
npm run cap:ios       # sync + open Xcode (macOS only)
```

**Android Studio (this machine)** — Install Android Studio + an AVD (API 24+). Keep the host API up (`aws login` on this PC if RDS secrets expired, then `npm run dev`). Run `npm run cap:android`, then Run on an emulator. Expect Field UI + **Hello Field — Android**. The emulator reaches the host API at `10.0.2.2:3000` (you do not run AWS login inside the emulator).

**Physical Android device** — Enable Developer options + USB debugging, connect the device, select it in Android Studio, Run. Same Hello banner confirms the native shell. For API access, rebuild with your PC’s LAN IP, e.g. `VITE_API_BASE=http://192.168.x.x:3000 npm run cap:sync`.

**iOS Simulator (iMac)** — iOS cannot be built on Windows. On the Mac: clone/pull, `npm install`, `npm run cap:sync` (runs `pod install` via CocoaPods), then `npm run cap:ios` or open `ios/App/App.xcworkspace` in Xcode. Pick an iPhone simulator → Run. Expect **Hello Field — iOS**.

If `ios/` is missing on the Mac, run `npx cap add ios` once and commit it.
