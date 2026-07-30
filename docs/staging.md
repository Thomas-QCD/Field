# Field staging (generic CloudFront URL)

Smoke-test environment in account `730335210534`, region `us-west-1`. **No custom DNS** — use the CloudFront default hostname (`https://dxxxx.cloudfront.net`).

Reuses existing **field-dev** RDS (`sg-047c106a0f501684d`), **field-dev-attachments**, and **SES** (`qcdlv.net`). New resources: S3 web bucket, CloudFront, ECR, ECS Fargate, ALB.

IaC: AWS CDK under [`infra/`](../infra/). Do **not** run `cdk deploy` until you explicitly approve provisioning.

## Architecture

```text
Browser → CloudFront (*.cloudfront.net)
            ├─ /*     → S3 field-staging-web-*  (SPA)
            └─ /api/* → ALB (HTTP) → ECS Fargate (Node API)
                         └─ RDS field-dev, S3 attachments, SES
```

Same-origin `/api` matches production builds in [`src/api/client.ts`](../src/api/client.ts) (relative paths when `VITE_API_BASE` is unset).

## One-time setup (after approve)

```bash
cd infra && npm install && cd ..
npm run infra:deploy
```

Stack name: `FieldStaging`. Outputs and SSM params:

| SSM parameter | Meaning |
|---------------|---------|
| `/field/staging/url` | `https://d….cloudfront.net` |
| `/field/staging/distribution-id` | CloudFront id |
| `/field/staging/web-bucket` | SPA bucket |
| `/field/staging/ecr-uri` | API image repo |
| `/field/staging/cluster-name` | ECS cluster |
| `/field/staging/service-name` | ECS service |

ECS starts at **desired count 0** until an image exists.

## Deploy app bits

```bash
# 1) API image + start service
npm run api:staging

# 2) Static web
npm run web:staging

# 3) Allow browser presigned uploads from the CloudFront origin
npm run s3:cors
```

Smoke:

1. `https://d….cloudfront.net/api/health`
2. Open the SPA URL (local stub login for first pass)

## Auth

Staging SPA was built with `VITE_AZURE_*` from local `.env` (Entra sign-in in the browser).

API Entra vars are injected from SSM at task start:

| SSM parameter | ECS env |
|---------------|---------|
| `/field/staging/azure-client-id` | `AZURE_CLIENT_ID` |
| `/field/staging/azure-tenant-id` | `AZURE_TENANT_ID` |

Create/update those params from your `.env` (same values as local `AZURE_*`), then `npm run infra:deploy` so the task definition picks them up.

Also add SPA redirect URI `https://d….cloudfront.net` in the Entra app registration (see `/field/staging/url`).

Without the API `AZURE_*` values, Microsoft sign-in appears to work but `/api/auth/session` fails and My Tasks shows “Select a user”.

## Mobile (Capacitor → staging API)

Bundled Cap builds default to the host loopback API (`10.0.2.2:3000` / `127.0.0.1:3000`). To dogfood against staging instead:

```bash
npm run cap:staging
# or open the IDE after sync:
npm run cap:staging -- --open android
```

This reads `/field/staging/url` from SSM, builds with `VITE_API_BASE` set to that HTTPS origin, clears Cap live-reload, and runs `npx cap sync`.

**Do not** follow with `npm run cap:android` / `cap:ios` — those re-run `cap:sync` without `VITE_API_BASE` and point the app back at the local API. Use `npx cap open android` / `ios` after `cap:staging`.

Smoke:

1. Staging web (`/field/staging/url`) → Users → Issue QR for a crew user
2. Install the Cap build on a device/emulator → activate (scan or paste `field1.…`)
3. List assigned tasks, update status, upload a photo
4. Web → revoke device → next API call clears the session → QR gate again

Attachment uploads use the same S3 bucket; Cap origins are already in CORS (`capacitor://localhost`, `https://localhost`). Re-run `npm run s3:cors` if uploads fail.

Live reload (`cap:live`) still uses the local Vite/API — only `cap:staging` (or a manual `VITE_API_BASE=… npm run cap:sync`) targets CloudFront.

### Signed release APK (sideload)

One-time keystore (do not commit; back up the `.jks` + password):

```bash
FIELD_KEYSTORE_PASSWORD='choose-a-strong-password' npm run android:keystore
```

Build a signed release APK aimed at staging (HTTPS only, WebView debug off):

```bash
npm run apk:staging
# or build + LAN download page:
npm run apk:staging -- --serve
```

Output: `dist-apk/field-staging.apk`. Optional version bumps: `FIELD_VERSION_CODE=2 FIELD_VERSION_NAME=1.0.1 npm run apk:staging`.

Debug sideload against the **local** API remains `npm run apk:serve` (unsigned debug APK).

## Custom domain later

Add an alternate domain + ACM certificate on the **same** CloudFront distribution. No architecture change.

## Commands reference

| Script | Action |
|--------|--------|
| `npm run infra:synth` | CDK synth (no AWS writes beyond context lookups) |
| `npm run infra:diff` | Diff vs deployed stack |
| `npm run infra:deploy` | Deploy/update stack (**creates AWS resources**) |
| `npm run api:staging` | Docker build/push + ECS desiredCount=1 |
| `npm run web:staging` | `vite build` → S3 sync → CF invalidation |
| `npm run cap:staging` | Build Cap web bundle with staging `VITE_API_BASE` + `cap sync` |
| `npm run android:keystore` | One-time release keystore + `keystore.properties` |
| `npm run apk:staging` | Signed release APK → staging (`dist-apk/field-staging.apk`) |
| `npm run s3:cors` | Refresh attachments CORS (includes staging URL when SSM exists) |
