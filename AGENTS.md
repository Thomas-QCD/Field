# Field — Agent Context

Quick orientation for AI agents working on this project.

## What This Is

**Field** is a field workforce management (FWM) application. It is being built to mirror the capabilities of a third-party FWM product the organization currently licenses, with the long-term goal of becoming a full replacement for that licensed solution.

This repository is greenfield. There is no existing codebase or formal requirements documentation yet.

## Core Concept: The Task

The **task** is the primary unit of the system. Everything else should support task creation and execution.

| Role | Responsibility |
|------|----------------|
| **Task creator** | Creates and assigns tasks |
| **Task executor** | Performs and completes tasks |

Other entities (users, teams, locations, schedules, etc.) may exist, but they exist in service of tasks. When scoping features or data models, start from the task lifecycle: create → assign → execute → complete.

**Reference task shape:** A rough draft from the licensed system is documented in [`docs/task-model.md`](docs/task-model.md). Known examples: `TaskType` = `Delivery`, `Status` = `Loaded`. Full status/type enums and transition rules are not yet documented.

## Critical Features

These are **required**, not nice-to-haves. Details in [`docs/critical-features.md`](docs/critical-features.md).

| Feature | Scope |
|---------|--------|
| **PDF generation** | Shipping label, delivery docket, POD (proof of delivery) — server-generated, stored per task |
| **Automatic email** | Triggered by task events; sent to recipient emails (and others TBD); logged for audit |

When scoping MVP, include at least one PDF type and one email trigger end-to-end before considering the document/email pipeline complete. Do not treat these as post-MVP unless the user explicitly descopes.

| Aspect | Status |
|--------|--------|
| Development phase | **Build (started)** — web shell + Tasks page; see [`docs/sdd.md`](docs/sdd.md) |
| Core domain model | **Task-centric** — draft schema in [`docs/task-model.md`](docs/task-model.md) |
| Primary platform | **Web** (mobile-responsive from the start) |
| Frontend | **React + TypeScript** |
| Mobile clients | **Capacitor** — private **per-executor** builds with embedded identity |
| Hosting (production target) | **AWS** — integrate when user specifies |
| Development environment | **Local only** until user directs otherwise |
| Database (local dev) | **PostgreSQL** locally (Docker or native) |
| Database (production target) | **RDS PostgreSQL** — see [`docs/database-design.md`](docs/database-design.md) |
| Backend / API | **Not decided** |
| Auth | **Web only** — mobile app has no login (see [Authentication](#authentication)) |
| MVP scope | **Not defined** (task field subset TBD) |
| Critical features | **PDF generation**, **automatic email** — see [`docs/critical-features.md`](docs/critical-features.md) |

Many product details remain open. Treat undecided items as open until documented elsewhere in the repo.

## Platform & Clients

### Web-first (single codebase)

Field is built as a **React + TypeScript web application**. This is the lead platform for design and initial delivery.

Design **mobile-responsive UI from the start** — field executors will use the same UI on phones inside the Capacitor shell. The **web app requires login**; the **mobile app does not**.

### Mobile via Capacitor (decided)

Android and iOS apps are delivered by wrapping the **same built web app** in a native shell using **Capacitor**. This is not a separate mobile codebase or a one-click export.

**Distribution:** Mobile apps are **not published to public app stores**. Deploy internally only (e.g. enterprise MDM, sideload, or private org distribution).

**Authentication:** The mobile app **does not implement user login**. Each executor receives a **private build with their identity embedded at build time** (user ID, display name — see [Authentication](#authentication)). Web is the authenticated surface for creators, dispatch, and administration.

**Workflow:**

1. Develop and test the React web app (including mobile viewport).
2. Production-build static assets (`dist/` or `build/`).
3. Sync into native projects with Capacitor (`npx cap sync`).
4. Run, test, and distribute **per-executor builds** internally via Xcode / Android Studio (not public store release).

**Implications for agents:**

- One UI codebase for web, iOS, and Android — branch behavior on client context (web vs Capacitor), especially for auth gates.
- **Do not add login screens, Cognito, or session flows to the mobile/Capacitor build.**
- **Per-executor builds:** embed `userId`, `displayName`, and optional API credentials at build time — one private build per driver.
- Use Capacitor plugins when native device APIs are needed (camera, push notifications, filesystem, etc.).
- Expect occasional mobile-specific tweaks (safe areas, keyboard, native permissions) — not a full rewrite.
- Offline-heavy requirements may stress this approach; flag tradeoffs if the user asks for robust offline-first behavior in MVP.

**Revisit React Native (Expo) only if:** offline-first becomes an MVP must-have, or native UX/background capabilities exceed what Capacitor reasonably supports.

## Authentication

| Client | Auth | Users |
|--------|------|-------|
| **Web** | **Required** — login before access | Creators, dispatch, admins |
| **Mobile (Capacitor)** | **None** — identity embedded in private build | Field executors (drivers) |

**Decided:**

- Authentication applies to **web access only**.
- The mobile app is **privately distributed** and **does not authenticate users at runtime**.
- Each executor gets a **dedicated private build** with their info **embedded at build time** (e.g. `userId`, `displayName`; optional mobile API token).
- Amazon **Cognito** is the target web auth provider for production; use local auth during development.

**Implementation notes:**

- The React app should detect runtime context (browser vs Capacitor) and **skip auth redirects on mobile**.
- On Capacitor, read embedded config (build-time env or bundled `executor.config.json`) to identify the driver on every API call.
- Mobile API requests include embedded identity (header or query) — API scopes tasks to that `userId` and sets audit fields (`changed_by_user_id`, `uploaded_by_user_id`).
- Web routes use Cognito JWT; mobile routes trust embedded build config (+ optional embedded API key for request authentication).

## Tech Direction

### Frontend

- **React + TypeScript** for all client UI.
- **Capacitor** for iOS and Android — private internal distribution, no auth.
- Add Capacitor to the project after core web task flows exist, or scaffold early if the user requests — default to proving web flows first per MVP discipline.
- Structure routing so web-only routes (login, create task, dispatch board) are gated; executor routes work without a session on mobile.

## Development environment

**Until the user specifies otherwise, all development is local.** Do not provision AWS resources, deploy to the cloud, or wire up Cognito, RDS, S3, or SES during local development.

| Concern | Local (now) | AWS (when user integrates) |
|---------|-------------|----------------------------|
| Database | PostgreSQL via Docker Compose or local install | RDS PostgreSQL |
| API | `localhost` — Node/other runtime on dev machine | ECS Fargate, Lambda, etc. |
| Web app | Vite dev server | S3 + CloudFront |
| File storage | Local filesystem or `./storage` directory | S3 |
| Web auth | Simple local auth (dev users, JWT stub, or session mock) | Amazon Cognito |
| Email | Log to console, write to file, or Mailpit/Mailhog | Amazon SES |
| PDF output | Local `./storage/documents` | S3 |

**Agent rules:**

- **Do not** run `aws` CLI deploys, create AWS resources, or add hard Cognito/SES/S3 dependencies without user approval.
- **Do** use abstractions (storage provider, email provider, auth provider) so swapping to AWS later is straightforward.
- **Do** use Docker Compose for PostgreSQL if helpful — still local.
- When the user says to integrate AWS, update this section and [`docs/sdd.md`](docs/sdd.md) Section 11.

### Hosting & infrastructure (AWS — production target)

Production will run on **AWS**. Do not set this up until the user directs integration.

**Target AWS services** (for when integration happens):

| Concern | Common AWS fit |
|---------|----------------|
| API | API Gateway + Lambda, or ECS/Fargate for a long-running Node API |
| Auth | **Amazon Cognito** — web clients only; mobile has no user login |
| File uploads | S3 with presigned URLs (task photos, attachments) |
| Database | **RDS PostgreSQL** — schema in [`docs/database-design.md`](docs/database-design.md) |
| Static web hosting | S3 + CloudFront |
| Push notifications | SNS, or FCM/APNs integration via Capacitor plugins |
| Email | **Amazon SES** — automatic task emails (see [`docs/critical-features.md`](docs/critical-features.md)) |
| PDF storage | **S3** — generated shipping labels, dockets, PODs |

Design code for AWS compatibility, but run locally until integration is requested.

### Backend

API layer is **not yet chosen**. Database is **relational (PostgreSQL)** — local for development, RDS when on AWS. Web auth: **local stub now**, Cognito when integrated. See [Development environment](#development-environment).

## Guiding Principle: Minimum Viable Product First

The leading constraint for all work on this project:

> **Do not go overboard adding features.** Feature creep directly undermines the goal of shipping a minimum functioning product.

When making suggestions or implementing work:

1. **Prefer the smallest thing that works** — solve the immediate need, not hypothetical future needs.
2. **Defer nice-to-haves** — polish, edge cases, and "while we're here" additions belong after MVP.
3. **Mirror before innovate** — parity with the licensed product comes first; improvements come later.
4. **Question scope expansion** — if a request adds surface area, flag it and propose a narrower alternative.
5. **Document assumptions** — when requirements are unclear, state assumptions explicitly rather than inventing features.
6. **Task-first scoping** — ask whether a feature is essential to creating or executing a task before adding it.
7. **Critical features are in scope** — PDF generation (label, docket, POD) and automatic email are confirmed requirements; do not defer without user approval.

## What Agents Should Know

### Domain (high level)

Field workforce management covers work performed outside a central office. Model the domain around **tasks**. See [`docs/task-model.md`](docs/task-model.md) for the full draft field list.

**Task structure (summary):**

| Group | Key fields |
|-------|------------|
| Identity | `TaskType`, `Status`, `TaskDesc`, `ExternalKey` |
| Assignment | `AssignedToDriverUserId`, `AssignedToTeamId`, `DriverName`, `Guys`, `Hours` |
| Scheduling | `AfterDateTime`, `BeforeDateTime`, `IsTimeSpecific`, `CanInstallEarly` |
| Locations | `Dispatch*` (pickup), `Destination*` (job site), coordinates as `"lat,lng"` |
| Contacts | Recipient (`RecipientId`, name, email, phone), `TaskCreatedBy` |
| Completion | `CompletedNotes`, `CompletedDateTime`, `TaskFailedReason` |

**From the reference example:**

- `TaskDesc` holds rich executor instructions (directions, access codes, photo requirements).
- Delivery tasks may use **destination only** (dispatch fields null).
- Executors are assigned by user ID; display names are denormalized on the task.
- Photo proof may be instruction-driven (described in `TaskDesc`) — attachment model TBD.

Do not implement every table or field for MVP. See [`docs/database-design.md`](docs/database-design.md) for the full schema and MVP subset. Work with the user to define the minimum slice for create → assign → execute → complete.

**Related tables (summary):** `users`, `teams`, `addresses`, `recipients`, `recipient_emails`, `task_types`, `task_statuses`, `tasks`, `task_attachments`, `task_status_events`, `task_documents`, `email_deliveries`.

### Reference system

There is an existing licensed FWM product that serves as the functional reference. Its name, vendor, and detailed feature set are not documented in this repo yet. When the user provides screenshots, exports, or feature lists from that system, treat those as the source of truth for parity discussions. The first task export is captured in [`docs/task-model.md`](docs/task-model.md).

### This repo

- **Project name:** Field
- **Workspace directory:** `orders` (local folder name; product name is Field)
- **Contents:** Vite + React + TypeScript web app (Tasks shell); docs under `docs/`.
- **Docs:** [`docs/sdd.md`](docs/sdd.md) (master design), `AGENTS.md`, `docs/task-model.md`, `docs/database-design.md`, `docs/critical-features.md`.
- **Run locally:** `npm install && npm run dev` → http://localhost:5173

## Recommended Agent Behavior by Phase

### Pre-design (complete)

Design artifacts consolidated in [`docs/sdd.md`](docs/sdd.md).

### Design (complete)

Master design in [`docs/sdd.md`](docs/sdd.md); proceed with MVP vertical slices.

### Build (current)

- React + TypeScript + Vite web app exists at repo root (`npm run dev`).
- App shell: mobile-first hamburger + left sidebar; **Tasks** is the only page so far (mock data grid).
- Follow [`docs/sdd.md`](docs/sdd.md); implement MVP slices vertically.
- Do not add dependencies, modules, or abstractions without clear MVP justification.
- Build mobile-responsive web UI; add Capacitor when ready to test on devices or distribute internally.
- **Web:** authenticated session (local auth in dev; Cognito JWT in production) — auth not wired yet.
- **Mobile:** no login UI; API calls carry identity from **embedded build config** (`userId`, optional API token).
- Do not unify auth across clients — web uses session/JWT; mobile uses embedded identity.
- **Local only** until user specifies — no AWS provisioning or cloud deploys.

## Open Questions (to resolve with the user)

These are intentionally unanswered. Do not assume answers:

- What is the licensed product name/vendor?
- Full list of `TaskType` and `Status` values and allowed transitions?
- MVP field subset: which fields from [`docs/task-model.md`](docs/task-model.md) are required at create, assign, execute, complete?
- PDF/email triggers: which task events generate which document and send which email?
- Sample PDF layouts from licensed product (label, docket, POD)?
- User roles beyond creator and executor (supervisors, admins, read-only)?
- Per-executor build pipeline: how builds are generated and distributed (script, CI, MDM)?
- Optional: embed mobile API token per build for request authentication?
- AWS integration timing — user will specify when to move off local dev
- AWS backend shape (when integrating): serverless (Lambda) vs containerized (ECS)?
- Confirm status transitions and whether `recipients` master table is MVP-required
- Integrations (payroll, CRM, GPS, accounting, etc.)?
- Compliance, security, or industry constraints?
- Timeline and team size?

## Updating This File

Update `AGENTS.md` when any of the following change:

- Development phase moves forward (e.g., pre-design → design → build)
- Task model, MVP scope, or requirements are formally defined
- Architecture or backend/auth/database decisions are made
- Mobile strategy or hosting changes (currently Capacitor + AWS production target)
- The reference licensed product is identified and documented
- Core principles or constraints shift

Keep this file factual and scannable. Detailed specs belong in separate documents linked from here once they exist.
