# Mac + iOS quick start

Set up Field on a new Mac and run the Capacitor app in the iOS Simulator (or on a physical iPhone).

iOS builds require macOS + Xcode. This cannot be done from Windows.

## 1. Install prerequisites

| Tool | Notes |
| ---- | ----- |
| **Xcode** | App Store → install → open once and accept the license. Include iOS Simulator. |
| **Xcode CLT** | `xcode-select --install` if prompted |
| **Homebrew** | [https://brew.sh](https://brew.sh) |
| **Node.js 22+** | `brew install node` (or nvm / fnm) |
| **CocoaPods** | `sudo gem install cocoapods` then `pod setup` |
| **Git** | `brew install git` if needed |
| **AWS CLI** | `brew install awscli` — needed for RDS password + S3 credentials |

Confirm:

```bash
node -v
npm -v
pod --version
xcodebuild -version
aws --version
```

## 2. Clone and install

```bash
git clone <repo-url> field
cd field
npm install
```

If `ios/` is missing:

```bash
npx cap add ios
```

## 3. Configure `.env`

```bash
cp .env.example .env
```

Edit `.env` and set a full `DATABASE_URL` (not empty). Example shape:

```env
DATABASE_URL=postgresql://field_admin:URL_ENCODED_PASSWORD@field-dev.c9saiusmgamc.us-west-1.rds.amazonaws.com:5432/field
AWS_REGION=us-west-1
S3_BUCKET=field-dev-attachments
```

Ask a teammate for the current password (or Secrets Manager value) so you do not need a working `aws` CLI on the Mac for database access. The API loads `.env` on startup — after editing, restart `npm run dev`.

Your Mac must be able to reach RDS `field-dev` (security group allows your public IP). Ask a teammate if the SG needs updating.

**Attachments (S3) need AWS credentials on the Mac**, even when `DATABASE_URL` already has the DB password. Tasks/contacts can work without AWS CLI; uploads and PDF/image previews will not. Before testing attachments:

```bash
aws login
# or: aws sso login --profile <your-profile>
aws sts get-caller-identity   # should print your account/user
```

Then restart `npm run dev` so the API picks up the session. Do not put long-lived access keys in `.env`.

Optional first-time schema (empty tables):

```bash
npm run db:schema
```

## 4. Run the local stack

```bash
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3000  

Keep this running while testing the mobile app.

## 5. iOS Simulator — day-to-day (live reload)

Preferred loop: Vite hot reload inside the native WebView.

**Terminal 1** (already running):

```bash
npm run dev
```

**Terminal 2** — point Capacitor at localhost Vite (syncs **ios only**; do **not** use the default Android `10.0.2.2` URL):

```bash
npm run cap:live -- ios
```

(`CAP_SERVER_URL=http://127.0.0.1:5173` is set for you. Override only if needed.)

Then open Xcode and Run:

```bash
npx cap open ios
```

Or open `ios/App/App.xcworkspace` (use the **workspace**, not the `.xcodeproj`).

In Xcode:

1. Select an iPhone simulator.
2. Product → Run (▶).

UI edits in the React app should hot-reload in the simulator. API calls go through the Vite `/api` proxy to `:3000`.

## 6. iOS Simulator — bundled build

Production-style assets copied into the native project:

```bash
npm run cap:ios
```

That runs `build` → `cap sync` (including `pod install`) → opens Xcode. Pick a simulator → Run.

Bundled iOS simulator API default is `http://127.0.0.1:3000` (see `src/api/client.ts`). Keep `npm run dev` (or at least the API) running on the Mac.

To leave live-reload mode and return to bundled assets, run `npm run cap:sync`.

## 7. Physical iPhone

1. Same Wi‑Fi as the Mac.
2. In Xcode: select your device, set a Team under Signing & Capabilities (Apple ID is fine for personal/dev).
3. Trust the developer on the phone if prompted.

**Live reload:**

```bash
npm run dev
npm run cap:live -- ios
# or, if not on the same machine loopback:
CAP_SERVER_URL=http://$(ipconfig getifaddr en0):5173 npm run cap:live -- ios
npx cap open ios
```

Use the Mac’s LAN IP for Vite when the phone cannot reach `127.0.0.1`. Run and select the phone in Xcode.

**Bundled build** (API must use the Mac’s LAN IP, not localhost):

```bash
VITE_API_BASE=http://192.168.x.x:3000 npm run cap:sync
npx cap open ios
```

Replace `192.168.x.x` with the Mac’s IP (`ipconfig getifaddr en0`).

If attachment uploads fail after a LAN IP change:

```bash
npm run s3:cors
```

## Useful commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | API + Vite |
| `npm run dev:stop` | Free ports 3000 + 5173 |
| `npm run cap:live -- ios` | Live reload → Simulator (`127.0.0.1`, ios sync only) |
| `CAP_SERVER_URL=http://<mac-lan-ip>:5173 npm run cap:live -- ios` | Live reload → physical iPhone |
| `npm run cap:sync` | Build web + sync into `ios/` / `android/` |
| `npm run cap:ios` | Sync + open Xcode |
| `npm run s3:cors` | Refresh S3 CORS for current LAN IP |

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `pod install` fails | Install CocoaPods; from `ios/App` run `pod install` |
| **Sign in failed: BarcodeScanner plugin is not implemented on ios** | Native pods are missing/stale (Windows `cap sync` skips CocoaPods). On the Mac: `cd ios/App && pod install`, then in Xcode Product → Clean Build Folder and Run again. Or from repo root: `npx cap sync ios` (runs `pod install`). |
| `GoogleMLKit/BarcodeScanning` … required a higher minimum deployment target | Podfile / Xcode must be **iOS 15.5+** (ML Kit 7). Repo is set to `15.5`; pull latest, then `cd ios/App && pod install`. |
| Blank WebView / can’t reach Vite | Use `npm run cap:live -- ios` (Simulator → `127.0.0.1`), not Android’s `10.0.2.2` |
| `ENOENT` … `android/.../assets/capacitor.config.json` | Old `cap:live` synced Android too. Use `npm run cap:live -- ios`, or `mkdir -p android/app/src/main/assets` then retry |
| API errors on device | Set `VITE_API_BASE=http://<mac-lan-ip>:3000` for bundled builds; phone and Mac on same Wi‑Fi |
| Tasks/contacts work, but attachments fail with **Could not load credentials from any providers** | Not an iOS misconfig. The Mac API needs AWS credentials to presign S3 URLs (DB can work from `DATABASE_URL` alone). On the Mac: `aws login` (or SSO login for your profile), confirm `aws sts get-caller-identity`, then restart `npm run dev`. |
| RDS connection refused | Re-login AWS; confirm SG allows this Mac’s public IP; check `DATABASE_URL` |
| Signing error on device | Xcode → Signing & Capabilities → choose your Team |
| Destination list only shows **My Mac / Any iOS Device / Any iOS Simulator Device** (no iPhone) | Older builds linked **Google ML Kit** on iOS, which hides Apple Silicon simulator destinations. Current Podfile does **not** include ML Kit on iOS. Pull latest, then `cd ios/App && pod install`, quit Xcode, reopen `App.xcworkspace`, and pick **iPhone 17** (etc.). Sign in by **pasting** the `field1.…` code (QR camera scan is Android-only). |
| Stale live-reload URL | `npm run cap:sync` clears it and restores bundled `dist/` |

App ID: `app.field.mobile`. Mobile activation: issue a `field1.…` code from the desktop **Users** page. On **iOS Simulator**, paste it on the sign-in screen. On **Android**, scan or paste.
