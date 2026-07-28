# Database Design (Relational)

Normalized relational schema for Field, derived from the flat task export in [`task-model.md`](task-model.md).

**Master design document:** [`sdd.md`](sdd.md)

**Decisions:**

- **Relational database** — PostgreSQL (local Docker in dev; RDS on AWS in production).
- **Primary keys** — `bigint` identity for internal entities; `uuid` for users (Entra `oid` mapped to UUID for web-authenticated users).
- **Timestamps** — `timestamptz` stored in UTC.
- **Coordinates** — `numeric` latitude/longitude on `addresses` (destination). Crew start/end geotags live on `task_crew_events` (nullable lat/lng + accuracy). Optional geo on `task_status_events` for status-change audit.
- **No teams** — company-local workforce; tasks are assigned to individual **crew members** only. Reference `AssignedToTeamId` is ignored. Field does not use the word "driver".
- **Task type / status** — PostgreSQL enums (`task_type`, `task_status`) stored as text labels on `tasks` (e.g. `Delivery`, `Loaded`). No FK from `tasks` to lookup tables.
- **No dispatch address** — destination only; `dispatch_address_id` is not modeled.
- **Contacts vs addresses** — `contacts` are people (name/title/phone/email). `addresses` are destinations with optional `address_name` (venue label). They are independent.
- **Task assignment** — 0..many contacts via `task_contacts` (same pattern as `task_crew_members`); 0..1 destination via `tasks.destination_address_id`.

---

## Entity Relationship Overview

```mermaid
erDiagram
    users ||--o{ tasks : "creates"
    users ||--o{ task_crew_members : "assigned as crew"
    tasks ||--o{ task_crew_members : "has crew"

    contacts ||--o{ task_contacts : "contact on"
    tasks ||--o{ task_contacts : "has contacts"
    addresses ||--o| tasks : "destination"

    task_statuses ||--o{ task_status_events : "logged as"
    tasks ||--o{ task_status_events : "history"
    tasks ||--o{ task_attachments : "has"

    users ||--o{ task_status_events : "changed by"
    users ||--o{ task_crew_events : "starts/ends"
    tasks ||--o{ task_crew_events : "crew check-ins"
    users ||--o{ task_attachments : "uploaded by"
```

---

## Table Groups

| Group | Tables | Purpose |
|-------|--------|---------|
| Identity & access | `users`, `mobile_activation_codes`, `mobile_devices` | Web auth (Entra ID); mobile QR activation + device sessions |
| Locations | `addresses` | Job-site destinations with optional `address_name`; optional link from tasks |
| Contacts | `contacts` | People (name, title, phone, email) — not venues |
| Task reference data | `task_types`, `task_statuses`, `task_status_transitions` | Optional lookup / workflow metadata (tasks store enums directly) |
| Core | `tasks`, `task_crew_members`, `task_contacts` | Primary unit of work; crew + contacts + optional destination |
| Task extensions | `task_attachments`, `task_crew_events`, `task_status_events`, `task_documents`, `email_deliveries` | Photos, crew start/end logs, status audit, PDFs, outbound email log |

---

## Identity & Access

### `users`

People who create or execute tasks. Web users authenticate via Microsoft Entra ID; `users.id` is derived from Entra `oid`. Mobile crew members activate via QR (see below); user records still exist for assignment and audit. Amazon Cognito is not used.

| Column | Type | Constraints | Maps from reference |
|--------|------|-------------|---------------------|
| `id` | `uuid` | PK | `AssignedToDriverUserId` (reference) |
| `display_name` | `varchar(255)` | NOT NULL | `DriverName` (reference), `TaskCreatedBy` |
| `email` | `varchar(255)` | UNIQUE, nullable | — |
| `phone` | `varchar(50)` | nullable | — |
| `role` | `varchar(50)` | NOT NULL | creator, crew, admin, supervisor (expand later) |
| `is_active` | `boolean` | NOT NULL DEFAULT true | — |
| `created_at` | `timestamptz` | NOT NULL | — |
| `updated_at` | `timestamptz` | NOT NULL | — |

**Notes:**

- A user may hold multiple roles over time; MVP uses a single `role` column. Split to `user_roles` if needed later.
- Crew members are users with role `crew` (called "driver" in the reference system — Field uses **crew member**).
- **Web:** creators and admins authenticate; actions tied to logged-in user.
- **Mobile:** shared Capacitor build ships deactivated; crew activates by scanning a QR issued for their user. Durable device session until revoked remotely.

### Authentication model

| Client | User login | Typical actions |
|--------|------------|-----------------|
| Web | Yes (Entra ID) | Create tasks, assign crew, admin, issue/revoke mobile access |
| Mobile (Capacitor) | QR activation → device session | View assigned tasks, update status, upload photos |

The `users` table is required for assignment and web auth. Mobile identity comes from a **device session** created at QR activation (not build-time embedding).

### `mobile_activation_codes`

One-time (or short-lived) codes encoded in QR images issued from the web app for a specific crew user.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK | — |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | Crew member this code activates |
| `code_hash` | `varchar(255)` | NOT NULL, UNIQUE | Store hash only — never plaintext |
| `expires_at` | `timestamptz` | NOT NULL | Short TTL preferred |
| `used_at` | `timestamptz` | nullable | Set when redeemed |
| `created_by_user_id` | `uuid` | NOT NULL, FK → `users.id` | Admin/creator who issued |
| `created_at` | `timestamptz` | NOT NULL | — |
| `revoked_at` | `timestamptz` | nullable | Invalidate unused codes |

**Notes:** QR payload is plain text `field1.<base64url-32-bytes>` (SHA-256 stored in `code_hash`). Codes are **single-use** with a **24-hour** TTL. Multiple devices per user are allowed.

### `mobile_devices`

Registered devices after successful QR activation. Holds the durable session the app stores locally; admins revoke here to pull access remotely.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK | — |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` | Bound crew member |
| `token_hash` | `varchar(255)` | NOT NULL, UNIQUE | Hash of device session token |
| `device_label` | `varchar(255)` | nullable | Optional (model / name from client) |
| `activated_at` | `timestamptz` | NOT NULL | — |
| `last_seen_at` | `timestamptz` | nullable | Updated on API use |
| `revoked_at` | `timestamptz` | nullable | Remote pull — API returns 401 |
| `revoked_by_user_id` | `uuid` | nullable, FK → `users.id` | Who revoked |
| `activation_code_id` | `uuid` | nullable, FK → `mobile_activation_codes.id` | Audit trail |

**Notes:**

- Client stores the opaque session token permanently; server stores only `token_hash`.
- On revoke: set `revoked_at`; next mobile request fails; app clears local session and shows QR activation again.
- Whether one device per user or many is an open question — schema allows many.

---

## Locations

### `addresses`

Job-site destinations. Tasks may reference **0 or 1** address via `destination_address_id`. Field has **no pickup/dispatch address** — the company operates from one fixed location. Contacts (`contacts`) are not linked to addresses. Use `address_name` for the venue label users pick (e.g. Park MGM).

| Column | Type | Constraints | Maps from reference |
|--------|------|-------------|---------------------|
| `id` | `bigint` | PK | — |
| `address_name` | `varchar(255)` | nullable | Venue / location display name (e.g. Park MGM) |
| `street_line` | `varchar(500)` | NOT NULL | `DestinationAddress` |
| `building` | `varchar(255)` | nullable | `DestinationBuilding` |
| `notes` | `text` | nullable | `DestinationNotes` |
| `latitude` | `numeric(10,7)` | nullable | parsed from `DestinationCoordinates` |
| `longitude` | `numeric(10,7)` | nullable | parsed from `DestinationCoordinates` |
| `deleted_at` | `timestamptz` | nullable | Soft delete — null = active |
| `created_at` | `timestamptz` | NOT NULL | — |

**Index:** `(address_name)`; `(latitude, longitude)` if geospatial queries are needed later (PostGIS optional).

**Soft delete:** `DELETE` API sets `deleted_at = now()`. Lists and detail GET require `deleted_at IS NULL`.

---

## Contacts

### `contacts`

Contacts (people to notify or reference on a task). Assigned to tasks through `task_contacts`, not stored as denormalized columns on `tasks`. Venue / place names belong on `addresses.address_name`, not here.

| Column | Type | Constraints | Maps from reference |
|--------|------|-------------|---------------------|
| `id` | `bigint` | PK | `RecipientId` |
| `name` | `varchar(255)` | NOT NULL | `RecipientName` |
| `title` | `varchar(255)` | nullable | Role / relationship (e.g. Electrical manager) — Field-only |
| `phone` | `varchar(50)` | nullable | `RecipientPhone` |
| `email` | `varchar(255)` | nullable | `RecipientEmail` (single address) |
| `deleted_at` | `timestamptz` | nullable | Soft delete — null = active |
| `created_at` | `timestamptz` | NOT NULL | — |
| `updated_at` | `timestamptz` | NOT NULL | — |

**Soft delete:** `DELETE` API sets `deleted_at = now()`. Lists and detail GET require `deleted_at IS NULL`.

---

## Task enums (on `tasks`)

PostgreSQL enum types store the text labels used by the reference export and the app.

### `task_type` (enum)

| Value |
|-------|
| `Delivery` |
| `Install` |
| `Removal` |
| `Site Survey` |
| `Pickup` |
| `Other` |

### `task_status` (enum)

| Value | Notes |
|-------|-------|
| `Unassigned` | Initial / no crew member yet |
| `Assigned` | Crew member set |
| `Loaded` | Example: en route / loaded on truck |
| `In Progress` | On site / working |
| `Completed` | Success terminal |
| `Failed` | Failure terminal |
| `Undetermined` | Mixed crew outcomes / needs review |
| `Cancelled` | Cancelled in Wodely / voided |

### Wodely sync mapping

Live Wodely webhooks (`WOO-message-handler`) and reconciler (`updateModifiedWooTasks`) upsert into Postgres. **`tasks.id` = Wodely `Id`**.

| Wodely `TypeDesc` | Field `task_type` |
|-------------------|-------------------|
| `Delivery` | `Delivery` |
| `Pickup` | `Pickup` |
| `Field Workforce` | `Install` |
| `Appointment` | `Other` |
| other / unknown | `Other` |

| Wodely | Field `task_status` |
|--------|---------------------|
| `StatusDesc` Unassigned / Assigned / Loaded / Completed / Failed | same |
| `StatusDesc` `Arrived` / webhook `Driver arrived` | `In Progress` |
| `StatusDesc` `Transit` | `Loaded` |
| Webhook `task-cancelled` | `Cancelled` |

Lambda source: [`aws/lambdas/`](../aws/lambdas/). Dual-write keeps DynamoDB `WOO-tasks` and RDS `field` in sync.

---

## Task Reference Data

Optional lookup tables for labels/sort order and transition rules. **`tasks` does not FK to these** — current type/status live as enums on the row.

### `task_types`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `smallint` | PK |
| `code` | `varchar(50)` | UNIQUE, NOT NULL |
| `name` | `varchar(100)` | NOT NULL |
| `sort_order` | `smallint` | NOT NULL DEFAULT 0 |

**Seed data (from reference):**

| code | name |
|------|------|
| `delivery` | Delivery |
| `install` | Install |
| `removal` | Removal |
| `site_survey` | Site Survey |
| `other` | Other |

### `task_statuses`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `smallint` | PK |
| `code` | `varchar(50)` | UNIQUE, NOT NULL |
| `name` | `varchar(100)` | NOT NULL |
| `sort_order` | `smallint` | NOT NULL DEFAULT 0 |
| `is_terminal` | `boolean` | NOT NULL DEFAULT false |

**Seed data:** same labels as the `task_status` enum (`created` → `Created`, etc.).

### `task_status_transitions`

Allowed workflow edges. Enforce in application layer (or DB trigger) when status changes.

| Column | Type | Constraints |
|--------|------|-------------|
| `from_status_id` | `smallint` | PK, FK → `task_statuses.id` |
| `to_status_id` | `smallint` | PK, FK → `task_statuses.id` |

**Draft transition graph** (confirm with business):

```text
created → unassigned | assigned
unassigned → assigned
assigned → loaded | failed
loaded → in_progress | failed
in_progress → completed | failed
completed → (terminal)
failed → (terminal)
```

Adjust when real workflow rules are confirmed.

---

## Core: `tasks`

Central table. Contacts and crew are junction tables; destination is an optional FK to `addresses`.

| Column | Type | Constraints | Maps from reference |
|--------|------|-------------|---------------------|
| `id` | `bigint` | PK | `Id` |
| `task_type` | `task_type` | enum, NOT NULL | `TaskType` |
| `status` | `task_status` | enum, NOT NULL | `Status` |
| `description` | `text` | nullable | `TaskDesc` |
| `external_key` | `varchar(100)` | nullable, indexed | `ExternalKey` |
| `created_by_user_id` | `uuid` | FK → `users.id`, NOT NULL | `TaskCreatedBy` (resolved to user) |
| `destination_address_id` | `bigint` | FK → `addresses.id`, nullable | `Destination*` (0..1) |
| `crew_size` | `smallint` | nullable | `Guys` |
| `estimated_hours` | `numeric(5,2)` | nullable | `Hours` |
| `is_time_specific` | `boolean` | NOT NULL DEFAULT false | `IsTimeSpecific` |
| `can_start_early` | `boolean` | NOT NULL DEFAULT false | `CanInstallEarly` (Field: can start early — all task types) |
| `window_start_at` | `timestamptz` | nullable | `AfterDateTime` |
| `window_end_at` | `timestamptz` | nullable | `BeforeDateTime` |
| `completed_notes` | `text` | nullable | `CompletedNotes` |
| `completed_at` | `timestamptz` | nullable | `CompletedDateTime` |
| `failed_reason` | `text` | nullable | `TaskFailedReason` |
| `deleted_at` | `timestamptz` | nullable | Soft delete — null = active |
| `created_at` | `timestamptz` | NOT NULL | `CreatedDateTime` |
| `updated_at` | `timestamptz` | NOT NULL | `ModifiedDateTime` |

**Soft delete:** `DELETE` API sets `deleted_at = now()`. Lists and detail GET require `deleted_at IS NULL`. Junction rows and destination FKs are left in place for history.

**Constraints:**

- `CHECK (window_end_at IS NULL OR window_start_at IS NULL OR window_end_at >= window_start_at)`

**Indexes:**

- `(status, window_start_at, window_end_at)` — task board / scheduling
- `(destination_address_id)`
- `(external_key)` where not null
- `(created_at DESC)`

**Crew assignment:** 0..many via `task_crew_members` (API/form: `crewMemberIds: string[]`).

**Contact assignment:** 0..many via `task_contacts` (API/form: `contactIds: number[]`). One POC per task (`is_poc` / `pocContactId`); defaults to the first contact in `contactIds`.

**Destination:** 0..1 via `destinationAddressId` (pick existing venue by `address_name`), or create a new `addresses` row from `destinationAddressName` + street/building/notes.

**Assignment rule (draft):** `Assigned` status should require at least one `task_crew_members` row. Enforce in service layer.

**Out of scope:** `dispatch_address_id` — Field has no pickup/dispatch.

### `task_crew_members`

Junction: which crew members are assigned to a task.

| Column | Type | Constraints |
|--------|------|-------------|
| `task_id` | `bigint` | PK, FK → `tasks.id` ON DELETE CASCADE |
| `user_id` | `uuid` | PK, FK → `users.id` |

**Index:** `(user_id)` — crew member task list / mobile scoping

### `task_contacts`

Junction: which contacts are on a task (mirrors `task_crew_members`). Exactly **one** contact may be the task **POC** (point of contact) when contacts exist — typically the first contact added.

| Column | Type | Constraints |
|--------|------|-------------|
| `task_id` | `bigint` | PK, FK → `tasks.id` ON DELETE CASCADE |
| `contact_id` | `bigint` | PK, FK → `contacts.id` |
| `is_poc` | `boolean` | NOT NULL, default `false` |

**Index:** `(contact_id)`

**Unique partial index:** one `is_poc = true` row per `task_id`.

**API:** `contactIds: number[]`; optional `pocContactId` (must be in `contactIds`). If omitted, the first `contactIds` entry is POC.
---

## Task Extensions

### `task_attachments`

Photos, signatures, and other files. Binary content in S3; metadata here.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK |
| `task_id` | `bigint` | FK → `tasks.id`, NOT NULL |
| `uploaded_by_user_id` | `uuid` | FK → `users.id`, NOT NULL |
| `kind` | `varchar(50)` | NOT NULL | `photo`, `signature`, `document`, `video` |
| `storage_key` | `varchar(500)` | NOT NULL | S3 object key |
| `mime_type` | `varchar(100)` | NOT NULL | |
| `file_name` | `varchar(255)` | nullable | |
| `file_size_bytes` | `bigint` | nullable | |
| `caption` | `text` | nullable | |
| `created_at` | `timestamptz` | NOT NULL | |

**Index:** `(task_id, created_at)`

### `task_documents`

Server-generated PDFs per task. Binary content in S3; metadata here. See [`critical-features.md`](critical-features.md).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK |
| `task_id` | `bigint` | FK → `tasks.id`, NOT NULL |
| `kind` | `varchar(50)` | NOT NULL | `shipping_label`, `delivery_docket`, `pod` |
| `storage_key` | `varchar(500)` | NOT NULL | S3 object key |
| `file_name` | `varchar(255)` | NOT NULL | e.g. `pod-12056480.pdf` |
| `generated_at` | `timestamptz` | NOT NULL | |
| `generated_by_user_id` | `uuid` | FK → `users.id`, nullable | null if system-generated on status change |

**Unique:** `(task_id, kind)` if only one active PDF per type per task; otherwise version with `generated_at` and no unique constraint.

**Index:** `(task_id, kind)`

### `email_deliveries`

Log of automatic outbound emails. See [`critical-features.md`](critical-features.md).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK |
| `task_id` | `bigint` | FK → `tasks.id`, NOT NULL |
| `trigger` | `varchar(50)` | NOT NULL | e.g. `task_completed`, `task_assigned` |
| `to_addresses` | `text` | NOT NULL | comma-separated or JSON array |
| `subject` | `varchar(500)` | NOT NULL | |
| `status` | `varchar(50)` | NOT NULL | `pending`, `sent`, `failed` |
| `provider_message_id` | `varchar(255)` | nullable | SES message ID |
| `error_message` | `text` | nullable | last failure reason |
| `sent_at` | `timestamptz` | nullable | |
| `created_at` | `timestamptz` | NOT NULL | |

**Index:** `(task_id, created_at)`, `(status)` where pending retry

### `task_crew_events`

Append-only per-crew start/end check-in log (one `started` and one `ended` per user per task). Stores when and where each assigned crew member began and finished work. Does **not** replace task status — the service derives status from these events:

- First `started` on the task → `tasks.status = In Progress` (unless already `In Progress` / terminal)
- When every user with a `started` also has an `ended` → `tasks.status = Completed` + `completed_at` (assigned crew who never started do not block)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK |
| `task_id` | `bigint` | FK → `tasks.id`, NOT NULL |
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | must be in `task_crew_members` |
| `event_type` | `varchar(20)` | NOT NULL | `started` \| `ended` |
| `latitude` | `numeric(10,7)` | nullable | crew GPS at check-in |
| `longitude` | `numeric(10,7)` | nullable | crew GPS at check-in |
| `accuracy_meters` | `numeric(8,2)` | nullable | device-reported fix accuracy |
| `recorded_at` | `timestamptz` | NOT NULL | client capture time (defaults to now) |
| `created_at` | `timestamptz` | NOT NULL | |

**Unique:** `(task_id, user_id, event_type)` — one start and one end per crew member.

**Index:** `(task_id, recorded_at)`

**Migration:** [`019_task_crew_events.sql`](../db/migrations/019_task_crew_events.sql)

### `task_status_events`

Append-only audit log for status changes (and optional assignment changes). Nullable geo columns for GPS at a status change if recorded. Crew start/end location belongs on `task_crew_events`. Compare destination coords via `tasks.destination_address_id` in the application (Haversine; PostGIS optional later).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK |
| `task_id` | `bigint` | FK → `tasks.id`, NOT NULL |
| `from_status_id` | `smallint` | FK → `task_statuses.id`, nullable |
| `to_status_id` | `smallint` | FK → `task_statuses.id`, NOT NULL |
| `changed_by_user_id` | `uuid` | FK → `users.id`, nullable | system if null |
| `notes` | `text` | nullable | |
| `latitude` | `numeric(10,7)` | nullable | GPS at this status change |
| `longitude` | `numeric(10,7)` | nullable | GPS at this status change |
| `accuracy_meters` | `numeric(8,2)` | nullable | device-reported fix accuracy |
| `recorded_at` | `timestamptz` | nullable | client capture time if different from `created_at` |
| `created_at` | `timestamptz` | NOT NULL | |

**Index:** `(task_id, created_at)`

**Migration:** [`018_task_status_events_geotag.sql`](../db/migrations/018_task_status_events_geotag.sql)

---

## Flat → Relational Mapping

| Reference field | Relational home |
|-----------------|-----------------|
| `Id` | `tasks.id` |
| `TaskType` | `tasks.task_type` (enum) |
| `Status` | `tasks.status` (enum) |
| `TaskDesc` | `tasks.description` |
| `ExternalKey` | `tasks.external_key` |
| `AssignedToDriverUserId` | `task_crew_members.user_id` → `users` (one of many) |
| `DriverName` | `users.display_name` (join via `task_crew_members`) |
| `AssignedToTeamId` | Ignored — Field has no teams |
| `Dispatch*` | Ignored — Field has no pickup/dispatch; one fixed origin |
| `TaskCreatedBy` | `tasks.created_by_user_id` → `users` |
| `Guys` | `tasks.crew_size` |
| `Hours` | `tasks.estimated_hours` |
| `AfterDateTime` / `BeforeDateTime` | `tasks.window_start_at` / `window_end_at` |
| `IsTimeSpecific` / `CanInstallEarly` | `tasks.is_time_specific` / `can_start_early` |
| `DestinationAddress` / `Building` / `Notes` | `tasks.destination_address_id` → `addresses` |
| `RecipientId` | `task_contacts.contact_id` (0..many) |
| `RecipientName` / `RecipientPhone` / `RecipientEmail` | `contacts` (join via `task_contacts`) |
| `CompletedNotes` / `CompletedDateTime` | `tasks.completed_notes` / `completed_at` |
| `TaskFailedReason` | `tasks.failed_reason` |
| Photos (in `TaskDesc` instructions) | `task_attachments` at completion |
| Generated PDFs | `task_documents` — `shipping_label`, `delivery_docket`, `pod` |
| Automatic emails | `email_deliveries` |
| Crew start/end time + geotags | `task_crew_events` |
| Status history | `task_status_events` |

---

## API Read Model (example)

Clients join contacts and destination from related tables:

```typescript
interface TaskReadModel {
  id: number;
  taskType: string;
  status: string;
  description: string | null;
  externalKey: string | null;
  crewMemberIds: string[];
  assignedCrew: { id: string; displayName: string }[];
  contactIds: number[];
  pocContactId: number | null;
  contacts: { id: number; name: string; title: string; phone: string; email: string; isPoc: boolean }[];
  destinationAddressId: number | null;
  destination: {
    streetLine: string;
    building: string | null;
    notes: string | null;
  } | null;
  crewSize: number | null;
  estimatedHours: number | null;
  windowStartAt: string | null;
  windowEndAt: string | null;
  isTimeSpecific: boolean;
  canStartEarly: boolean;
  completedNotes: string | null;
  completedAt: string | null;
  failedReason: string | null;
  attachments: TaskAttachmentDto[];
  documents: TaskDocumentDto[]; // shipping_label | delivery_docket | pod
  createdBy: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}
```

---

## Deferred / out of scope

| Table | Status |
|-------|--------|
| `teams` / `team_members` | **Out of scope** — company-local; crew-member assignment only |
| `task_line_items` | Deferred — materials embedded in `TaskDesc` today |
| `recipient_emails` | **Removed** — single `contacts.email` column |
| `task_failure_reasons` | Deferred — free-text `failed_reason` sufficient for MVP |
| `user_roles` | Deferred — single `role` column on `users` until multi-role is required |

---

## MVP Schema Subset

Minimum tables to support **create → assign → execute (status updates) → complete with photo**:

| Table | MVP |
|-------|-----|
| `users` | Yes |
| `mobile_activation_codes` | Yes — when mobile crew flow is in scope |
| `mobile_devices` | Yes — durable sessions + remote revoke |
| `contacts` | Yes — contacts master |
| `addresses` | Yes — destinations (0..1 per task) |
| `task_types` | Optional — enums on `tasks` are source of truth |
| `task_statuses` | Optional — enums on `tasks` are source of truth |
| `task_status_transitions` | Optional — can hardcode in app for MVP |
| `tasks` | Yes |
| `task_crew_members` | Yes — multi-assign (`crewMemberIds`) |
| `task_contacts` | Yes — multi-assign contacts (`contactIds`) |
| `task_attachments` | Yes — photo proof on completion |
| `task_documents` | Yes — PDF label, docket, POD |
| `email_deliveries` | Yes — automatic email log |
| `task_crew_events` | Yes — per-crew start/end logs; derives In Progress / Completed |
| `task_status_events` | Recommended — status-change audit trail |

---

## Deployment placement

**Schema DDL:** [`db/migrations/`](../db/migrations/) — `001` baseline; apply later files incrementally (e.g. `005_tasks_status_and_type_enums.sql`, `006_task_crew_members.sql`). No seed rows yet.

| Component | Local / cloud-dev | Production target (AWS) |
|-----------|-------------------|-------------------------|
| Database | PostgreSQL (Docker) or RDS `field-dev` | Amazon RDS for PostgreSQL |
| File blobs | `./storage/` filesystem | S3 — `task_attachments`, `task_documents` |
| Email | Console / Mailpit | Amazon SES — `email_deliveries` |
| Auth | Local dev auth stub | Entra ID — web; mobile device sessions via QR (not Cognito) |

Use storage and email abstractions so `storage_key` works for both local paths and S3 keys.

---

## Open Questions

- Confirm status transition rules with operations
- PDF generation triggers per document type (label, docket, POD)
- Email triggers and templates per task event
- One active mobile device per crew member vs multiple devices
- Address picker: select existing `addresses` by `address_name` vs free-text create on task form (picker + free-text both supported)
- Unique constraint on `external_key` (per integration source)?
- Soft-delete (`deleted_at`) on users? (tasks, contacts, addresses use `deleted_at`)
- Timezone display: store UTC only; client converts?
- Geofence: max distance (meters) from destination for valid start/end geotag; enforce vs warn-only?
