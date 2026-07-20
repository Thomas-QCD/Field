# Task Data Model (Draft)

Reference task shape from the licensed FWM product. This is a **rough draft** captured from a real example — not a finalized Field schema. Use it for parity discussions and MVP scoping.

**Source example:** Delivery task #12056480, status `Loaded`, assigned to Rick Sekikawa (reference calls this "driver"; Field uses **crew member**).

---

## Example Record

```json
{
  "Id": 12056480,
  "TaskType": "Delivery",
  "Status": "Loaded",
  "TaskDesc": "26-MBAY-12468-049 - WLV Stanchion Topper Signs x4\r\nDeliver to Mandalay Bay inside the sign shop...",
  "ExternalKey": "99252",
  "AssignedToTeamId": -1,
  "AssignedToDriverUserId": "e79c25d5-06b4-4468-b7a9-04a9718f5e72",
  "CreatedDateTime": "2026-07-09T21:31:53.773",
  "ModifiedDateTime": "2026-07-15T17:21:07.303",
  "AfterDateTime": "2026-07-15T15:00:00",
  "BeforeDateTime": "2026-07-16T00:00:00",
  "DispatchAddress": null,
  "DispatchBuilding": null,
  "DispatchNotes": null,
  "DispatchCoordinates": null,
  "DestinationAddress": "3950 S Las Vegas Blvd, Las Vegas, NV 89119, USA",
  "DestinationBuilding": "Sign shop",
  "DestinationCoordinates": "36.0891232,-115.174605",
  "DestinationNotes": null,
  "RecipientId": 139867,
  "RecipientName": "MBAY - Mandalay Bay",
  "RecipientEmail": "jaspiazu@mgmresorts.com , hernan@qcdlv.com",
  "RecipientPhone": null,
  "TaskCreatedBy": "Hernan",
  "Guys": 2,
  "Hours": 2,
  "IsTimeSpecific": false,
  "CanInstallEarly": false,
  "CompletedNotes": null,
  "CompletedDateTime": null,
  "TaskFailedReason": null,
  "DriverName": "Rick Sekikawa"
}
```

---

## Field Groups

### Identity & classification

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `Id` | integer | Internal primary key |
| `TaskType` | string | Example: `Delivery`. Field enum: Delivery, Install, Removal, Site Survey, Pickup, Other. Wodely also sends Field Workforce → Install, Appointment → Other |
| `Status` | string | Example: `Loaded`. Field enum: Created, Unassigned, Assigned, Loaded, Arrived, Completed, Failed, Cancelled. Wodely Transit → Loaded |
| `TaskDesc` | string (multiline) | Free-text instructions; may include job codes, access codes, photo requirements |
| `ExternalKey` | string | Reference to an external system (e.g. order/job number) |

### Assignment & crew

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `AssignedToTeamId` | integer | Reference only — Field has no teams; ignore on import |
| `AssignedToDriverUserId` | UUID string | Assigned crew member user ID (Field: one of `task_crew_members` / `crewMemberIds[]`) |
| `DriverName` | string | Denormalized display name — Field maps to crew member `display_name` |
| `Guys` | integer | Crew size estimate |
| `Hours` | integer | Time estimate (hours) |

### Scheduling window

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `CreatedDateTime` | datetime | When task was created |
| `ModifiedDateTime` | datetime | Last update |
| `AfterDateTime` | datetime | Earliest allowed start / window open |
| `BeforeDateTime` | datetime | Latest allowed completion / window close |
| `IsTimeSpecific` | boolean | Whether task is tied to a specific time |
| `CanInstallEarly` | boolean | Whether early execution is permitted. Field: `can_start_early` / `canStartEarly` (all task types, not Install-only) |

### Dispatch (origin / pickup) — reference only

Present in the licensed export (all null in the example). **Out of scope for Field** — the company operates from one fixed location; Field does not model pickup/dispatch addresses.

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `DispatchAddress` | string \| null | Ignored |
| `DispatchBuilding` | string \| null | Ignored |
| `DispatchNotes` | string \| null | Ignored |
| `DispatchCoordinates` | string \| null | Ignored |

### Destination (delivery / job site)

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `DestinationAddress` | string | Street address |
| `DestinationBuilding` | string \| null | Building, room, or area (e.g. `Sign shop`) |
| `DestinationCoordinates` | string | `"lat,lng"` — e.g. `"36.0891232,-115.174605"` |
| `DestinationNotes` | string \| null | Additional site instructions |

Field stores destinations in `addresses` with an optional **`address_name`** (venue label such as Park MGM) so users pick by name rather than street.

### Contact (contacts)

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `RecipientId` | integer | Contact entity ID |
| `RecipientName` | string | Display name — **people** in Field (`contacts.name`); venue names belong on `addresses.address_name` |
| `RecipientEmail` | string \| null | May contain **multiple emails**, comma-separated |
| `RecipientPhone` | string \| null | |
| `TaskCreatedBy` | string | Creator display name (not necessarily a user ID) |

### Completion & failure

| Field | Type (observed) | Notes |
|-------|-----------------|-------|
| `CompletedNotes` | string \| null | Notes entered on completion |
| `CompletedDateTime` | datetime \| null | When task was completed |
| `TaskFailedReason` | string \| null | Reason if task failed |

---

## Observations from the Example

1. **`TaskDesc` carries operational detail** — job identifiers, step-by-step directions, door codes, and photo requirements live in one text field. Crew members rely heavily on this.
2. **Photo proof is instruction-driven** — the example says to take a picture of the delivery; there is no separate `PhotoRequired` flag in this record (may exist elsewhere or be implied by task type).
3. **Destination only** — Field models job-site destination; reference `Dispatch*` is ignored (single fixed origin).
4. **Denormalized names** — `DriverName`, `TaskCreatedBy`, `RecipientName` appear alongside IDs. Field normalizes these into related entities; UI shows **crew** (not "driver") for the assignee.
5. **Coordinates are a comma-separated string** — consider parsing/storing as structured lat/lng in Field, but mirror the reference format if integrating with the licensed system.
6. **Scheduling is a window** — `AfterDateTime` / `BeforeDateTime` define an execution window, not necessarily a single appointment time (`IsTimeSpecific: false` here).

---

## TypeScript Reference (draft)

For implementation planning only — field names match the reference system; rename/normalize when designing the Field API.

```typescript
type TaskCoordinates = string | null; // "lat,lng" in reference system

interface Task {
  Id: number;
  TaskType: string;
  Status: string;
  TaskDesc: string;
  ExternalKey: string | null;

  AssignedToTeamId: number;
  AssignedToDriverUserId: string | null;
  DriverName: string | null;
  Guys: number | null;
  Hours: number | null;

  CreatedDateTime: string;
  ModifiedDateTime: string;
  AfterDateTime: string | null;
  BeforeDateTime: string | null;
  IsTimeSpecific: boolean;
  CanInstallEarly: boolean;

  DispatchAddress: string | null;
  DispatchBuilding: string | null;
  DispatchNotes: string | null;
  DispatchCoordinates: TaskCoordinates;

  DestinationAddress: string | null;
  DestinationBuilding: string | null;
  DestinationCoordinates: TaskCoordinates;
  DestinationNotes: string | null;

  RecipientId: number | null;
  RecipientName: string | null;
  RecipientEmail: string | null;
  RecipientPhone: string | null;

  TaskCreatedBy: string | null;

  CompletedNotes: string | null;
  CompletedDateTime: string | null;
  TaskFailedReason: string | null;
}
```

---

## Not in This Record (may exist elsewhere)

Do not assume absence — these may be separate entities, attachments, or fields not shown in this export:

- Task photos / attachments
- Signature capture
- Status transition history
- Line items / materials (e.g. "Stanchion Topper Signs x4" is embedded in `TaskDesc` here)
- Full list of `TaskType` and `Status` values
---

## Relational schema

The flat export above is normalized into related tables for PostgreSQL. See **[`database-design.md`](database-design.md)** for tables, relationships, indexes, MVP subset, and field mapping. System design: **[`sdd.md`](sdd.md)**. Field does **not** model teams — assignment is to a **crew member** only. Do not use "driver" in Field UI or schema names. Field does **not** model dispatch/pickup addresses.

## Open Questions

- Confirm status transition rules (draft graph in `database-design.md`)
- Are `Guys` and `Hours` required at creation or optional estimates?
- How are photos attached on completion — separate API/entity?
- ~~Should Field normalize `RecipientEmail`?~~ → Single `contacts.email`; assign contacts via `task_contacts`
- MVP subset: which fields are required to create, assign, execute, and complete a task?
