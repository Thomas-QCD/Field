/**
 * Wipe all tasks and seed 30 realistic Field tasks for local/dev (windows 2026-07-26..07-31).
 *
 * Usage: node scripts/seed-dev-tasks.mjs
 *        node scripts/seed-dev-tasks.mjs --dry-run
 */
import { randomBytes } from "node:crypto";
import { createPgClient } from "./lib/db.mjs";

const dryRun = process.argv.includes("--dry-run");

/** @type {Record<string, string>} */
const CREW = {
  rick: "e79c25d5-06b4-4468-b7a9-04a9718f5e72",
  hernan: "380d8088-2312-450c-bfbe-a73249a6b0b6",
  jimmy: "6cd68c05-7c5b-4f70-96de-230b9049278b",
  joe: "b2dc58ff-a481-4ed5-9939-dc494affc73c",
  david: "72b9aa65-fba7-4394-afe3-9152eeefc5eb",
  nickS: "9f2676c6-3056-40cd-b976-c5794ba54539",
  marcelo: "78d32507-d947-4d4d-b8d5-1c025c56c2be",
  greg: "dda0562e-c5cd-4323-81c2-aa3cc9085d77",
  anthony: "23e2bebb-362e-47aa-9ca0-1fc19059fbed",
  erin: "f27b59cf-acbb-4fac-b0e9-1df4dfaa2d5d",
};

/** @type {Record<string, string>} */
const CREATORS = {
  thomas: "a6c2a0c2-6266-4b3a-b786-eeae20667afe",
  nikki: "b1d056ad-01b1-47c6-8045-347c1b214652",
  carmen: "010e63a8-9b24-4520-bf76-cb32b28647c2",
  justin: "3eebbc14-08db-43ce-8c4d-41505b3c914a",
  jed: "cb28949b-650d-4b94-9032-41fa82919255",
};

/** Named venues from addresses table (stable ids from field-dev). */
const V = {
  parkMgm: 125,
  sunsetStation: 126,
  aces: 134,
  aria: 138,
  bellagio: 140,
  boulderStation: 144,
  cirque: 147,
  cna: 148,
  mgmGrand: 165,
  luxor: 181,
  mbay: 182,
  muda: 190,
  palazzo: 194,
  palaceStation: 199,
  resortsWorld: 200,
  tMobile: 219,
  containerPark: 149,
  gga: 162,
};

/** Existing S3 objects that still download (from prior uploads). */
const EXISTING = {
  photo:
    "attachments/1/0c5651fc-cb20-4e66-a9ca-88b79f9aa39f-20260514_094425.jpg",
  pdf: "attachments/1/b0876336-13e6-40d0-9b89-1d8c776ce18d-Bid Invitation.pdf",
  gif: "attachments/1/9538604d-653f-4857-bc65-45ef464a43c6-tr88d0xjf67g1.gif",
  video:
    "attachments/10308514/a223ebcd-50a6-4c8d-a5c9-9a465f84581c-20260724_083332.mp4",
  docket: "documents/delivery-docket-12192921.pdf",
};

/**
 * Pacific local wall time → ISO UTC string.
 * @param {string} local "YYYY-MM-DDTHH:mm:ss"
 */
function pt(local) {
  // Fixed offset for late July (PDT = UTC-7)
  const d = new Date(`${local}-07:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`bad datetime ${local}`);
  return d.toISOString();
}

/**
 * @typedef {{
 *   id: number,
 *   taskType: string,
 *   status: string,
 *   description: string,
 *   externalKey?: string | null,
 *   createdBy: string,
 *   destinationId?: number | null,
 *   crewSize?: number | null,
 *   hours?: number | null,
 *   isTimeSpecific?: boolean,
 *   canStartEarly?: boolean,
 *   windowStart?: string | null,
 *   windowEnd?: string | null,
 *   completedNotes?: string | null,
 *   completedAt?: string | null,
 *   failedReason?: string | null,
 *   createdAt: string,
 *   updatedAt: string,
 *   deletedAt?: string | null,
 *   crew?: string[],
 *   contacts?: { id: number, isPoc?: boolean, receivesEmail?: boolean }[],
 *   crewEvents?: { userId: string, type: 'started'|'ended', at: string, lat?: number, lng?: number }[],
 *   completionNotes?: { userId: string, outcome: 'Completed'|'Failed', notes?: string | null }[],
 *   attachments?: { kind: string, storageKey: string, mimeType: string, fileName: string, caption?: string | null, uploadedBy: string, at: string }[],
 *   documents?: { kind: string, storageKey: string, fileName: string, generatedAt: string, generatedBy?: string | null }[],
 *   emails?: { trigger: string, to: string, subject: string, status: string, sentAt?: string | null, error?: string | null }[],
 * }} SeedTask
 */

/** @type {SeedTask[]} */
const TASKS = [
  // —— 7/26 Sunday (past) — completed / failed / cancelled ——
  {
    id: 1,
    taskType: "Delivery",
    status: "Completed",
    description:
      "26-MBAY-12468-049 - WLV Stanchion Topper Signs x4\n" +
      "Deliver to Mandalay Bay inside the sign shop.\n" +
      "Door code: 4471#. Take photo of delivered stack against wall.\n" +
      "Leave packing slip with receiving.",
    externalKey: "99252",
    createdBy: CREATORS.thomas,
    destinationId: V.mbay,
    crewSize: 2,
    hours: 2,
    isTimeSpecific: false,
    canStartEarly: false,
    windowStart: pt("2026-07-26T08:00:00"),
    windowEnd: pt("2026-07-26T14:00:00"),
    completedNotes: "Rick: Delivered to sign shop; photos attached.",
    completedAt: pt("2026-07-26T11:42:00"),
    createdAt: pt("2026-07-24T09:15:00"),
    updatedAt: pt("2026-07-26T11:42:00"),
    crew: [CREW.rick, CREW.hernan],
    contacts: [
      { id: 117, isPoc: true },
      { id: 118 },
    ],
    crewEvents: [
      {
        userId: CREW.rick,
        type: "started",
        at: pt("2026-07-26T09:05:00"),
        lat: 36.0891,
        lng: -115.1746,
      },
      {
        userId: CREW.hernan,
        type: "started",
        at: pt("2026-07-26T09:08:00"),
        lat: 36.0892,
        lng: -115.1745,
      },
      {
        userId: CREW.rick,
        type: "ended",
        at: pt("2026-07-26T11:40:00"),
        lat: 36.0891,
        lng: -115.1746,
      },
      {
        userId: CREW.hernan,
        type: "ended",
        at: pt("2026-07-26T11:42:00"),
        lat: 36.0891,
        lng: -115.1746,
      },
    ],
    completionNotes: [
      {
        userId: CREW.rick,
        outcome: "Completed",
        notes: "Delivered x4 toppers; photo of stack attached.",
      },
      {
        userId: CREW.hernan,
        outcome: "Completed",
        notes: "Helped unload; packing slip left with Jordan.",
      },
    ],
    attachments: [
      {
        kind: "photo",
        storageKey: EXISTING.photo,
        mimeType: "image/jpeg",
        fileName: "delivery-proof.jpg",
        caption: "Stanchion toppers against sign-shop wall",
        uploadedBy: CREW.rick,
        at: pt("2026-07-26T11:35:00"),
      },
      {
        kind: "document",
        storageKey: EXISTING.pdf,
        mimeType: "application/pdf",
        fileName: "packing-slip.pdf",
        uploadedBy: CREW.hernan,
        at: pt("2026-07-26T11:38:00"),
      },
    ],
    documents: [
      {
        kind: "delivery_docket",
        storageKey: EXISTING.docket,
        fileName: "delivery-docket-1.pdf",
        generatedAt: pt("2026-07-26T11:43:00"),
        generatedBy: CREATORS.thomas,
      },
      {
        kind: "pod",
        storageKey: EXISTING.docket,
        fileName: "pod-1.pdf",
        generatedAt: pt("2026-07-26T11:44:00"),
        generatedBy: null,
      },
    ],
    emails: [
      {
        trigger: "task_completed",
        to: "jordan.butler@example.com, hernan@qcdlv.com",
        subject: "POD ready — Task #1 Mandalay Bay delivery",
        status: "sent",
        sentAt: pt("2026-07-26T11:45:00"),
      },
    ],
  },
  {
    id: 2,
    taskType: "Install",
    status: "Completed",
    description:
      "26-PARK-8812 - Lobby directional vinyl set (12pcs)\n" +
      "Install per mark-up in Marketing. Can start early if site open.\n" +
      "Photo each wall after install.",
    externalKey: "99301",
    createdBy: CREATORS.nikki,
    destinationId: V.parkMgm,
    crewSize: 2,
    hours: 3,
    isTimeSpecific: true,
    canStartEarly: true,
    windowStart: pt("2026-07-26T06:00:00"),
    windowEnd: pt("2026-07-26T10:00:00"),
    completedNotes: "Jimmy: All panels installed before lobby open.",
    completedAt: pt("2026-07-26T09:20:00"),
    createdAt: pt("2026-07-23T16:00:00"),
    updatedAt: pt("2026-07-26T09:20:00"),
    crew: [CREW.jimmy, CREW.joe],
    contacts: [{ id: 119, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.jimmy,
        type: "started",
        at: pt("2026-07-26T05:50:00"),
        lat: 36.105,
        lng: -115.176,
      },
      {
        userId: CREW.joe,
        type: "started",
        at: pt("2026-07-26T05:55:00"),
        lat: 36.105,
        lng: -115.176,
      },
      {
        userId: CREW.jimmy,
        type: "ended",
        at: pt("2026-07-26T09:15:00"),
        lat: 36.105,
        lng: -115.176,
      },
      {
        userId: CREW.joe,
        type: "ended",
        at: pt("2026-07-26T09:18:00"),
        lat: 36.105,
        lng: -115.176,
      },
    ],
    completionNotes: [
      {
        userId: CREW.jimmy,
        outcome: "Completed",
        notes: "Early start OK; 12 pcs installed.",
      },
      { userId: CREW.joe, outcome: "Completed", notes: null },
    ],
    attachments: [
      {
        kind: "photo",
        storageKey: EXISTING.photo,
        mimeType: "image/jpeg",
        fileName: "lobby-wall-a.jpg",
        uploadedBy: CREW.jimmy,
        at: pt("2026-07-26T09:10:00"),
      },
      {
        kind: "signature",
        storageKey: EXISTING.gif,
        mimeType: "image/gif",
        fileName: "site-signoff.gif",
        caption: "Marketing sign-off",
        uploadedBy: CREW.jimmy,
        at: pt("2026-07-26T09:16:00"),
      },
    ],
    documents: [
      {
        kind: "shipping_label",
        storageKey: EXISTING.docket,
        fileName: "shipping-label-2.pdf",
        generatedAt: pt("2026-07-25T17:00:00"),
        generatedBy: CREATORS.nikki,
      },
    ],
  },
  {
    id: 3,
    taskType: "Removal",
    status: "Failed",
    description:
      "26-BELL-2201 - Remove expired event banners from porte-cochère.\n" +
      "Lift required — confirm with security before boom.",
    externalKey: "99310",
    createdBy: CREATORS.carmen,
    destinationId: V.bellagio,
    crewSize: 2,
    hours: 2,
    isTimeSpecific: true,
    canStartEarly: false,
    windowStart: pt("2026-07-26T13:00:00"),
    windowEnd: pt("2026-07-26T17:00:00"),
    failedReason: "Security denied lift access; banners still up.",
    completedAt: pt("2026-07-26T14:30:00"),
    createdAt: pt("2026-07-25T10:00:00"),
    updatedAt: pt("2026-07-26T14:30:00"),
    crew: [CREW.david, CREW.marcelo],
    contacts: [{ id: 120, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.david,
        type: "started",
        at: pt("2026-07-26T13:10:00"),
        lat: 36.1126,
        lng: -115.1767,
      },
      {
        userId: CREW.marcelo,
        type: "started",
        at: pt("2026-07-26T13:12:00"),
        lat: 36.1126,
        lng: -115.1767,
      },
      {
        userId: CREW.david,
        type: "ended",
        at: pt("2026-07-26T14:25:00"),
        lat: 36.1126,
        lng: -115.1767,
      },
      {
        userId: CREW.marcelo,
        type: "ended",
        at: pt("2026-07-26T14:28:00"),
        lat: 36.1126,
        lng: -115.1767,
      },
    ],
    completionNotes: [
      {
        userId: CREW.david,
        outcome: "Failed",
        notes: "Security blocked boom; reschedule needed.",
      },
      {
        userId: CREW.marcelo,
        outcome: "Failed",
        notes: "Could not reach banners from ground.",
      },
    ],
    emails: [
      {
        trigger: "task_failed",
        to: "gabriel.yudis@example.com, carmen@qcdlv.com",
        subject: "Task #3 Failed — Bellagio banner removal",
        status: "sent",
        sentAt: pt("2026-07-26T14:32:00"),
      },
    ],
  },
  {
    id: 4,
    taskType: "Pickup",
    status: "Completed",
    description:
      "Pick up leftover foam core from Cirque warehouse after show strike.\n" +
      "Bring straps; load in box truck.",
    externalKey: "99322",
    createdBy: CREATORS.jed,
    destinationId: V.cirque,
    crewSize: 1,
    hours: 1.5,
    windowStart: pt("2026-07-26T15:00:00"),
    windowEnd: pt("2026-07-26T18:00:00"),
    completedNotes: "Nick: Pickup complete; returned to shop.",
    completedAt: pt("2026-07-26T16:45:00"),
    createdAt: pt("2026-07-26T08:00:00"),
    updatedAt: pt("2026-07-26T16:45:00"),
    crew: [CREW.nickS],
    contacts: [{ id: 121, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.nickS,
        type: "started",
        at: pt("2026-07-26T15:20:00"),
        lat: 36.068,
        lng: -115.15,
      },
      {
        userId: CREW.nickS,
        type: "ended",
        at: pt("2026-07-26T16:40:00"),
        lat: 36.068,
        lng: -115.15,
      },
    ],
    completionNotes: [
      {
        userId: CREW.nickS,
        outcome: "Completed",
        notes: "4 boards + scrap foam; shop rack B.",
      },
    ],
  },
  {
    id: 5,
    taskType: "Delivery",
    status: "Cancelled",
    description:
      "Client cancelled — Aces HQ table-top graphics delivery (was window Sun afternoon).",
    externalKey: "99330",
    createdBy: CREATORS.thomas,
    destinationId: V.aces,
    crewSize: 1,
    hours: 1,
    windowStart: pt("2026-07-26T12:00:00"),
    windowEnd: pt("2026-07-26T16:00:00"),
    createdAt: pt("2026-07-24T11:00:00"),
    updatedAt: pt("2026-07-26T09:00:00"),
    crew: [CREW.greg],
    contacts: [{ id: 123, isPoc: true }],
    emails: [
      {
        trigger: "task_cancelled",
        to: "vincent.pangelinan@example.com",
        subject: "Task #5 Cancelled — Aces delivery",
        status: "sent",
        sentAt: pt("2026-07-26T09:01:00"),
      },
    ],
  },

  // —— 7/27 Monday ——
  {
    id: 6,
    taskType: "Install",
    status: "Undetermined",
    description:
      "27-ARIA-5510 - Escalator wrap refresh (north bank).\n" +
      "Two-crew job. One tech had adhesion issues — outcomes may differ.",
    externalKey: "99401",
    createdBy: CREATORS.nikki,
    destinationId: V.aria,
    crewSize: 2,
    hours: 4,
    isTimeSpecific: false,
    canStartEarly: true,
    windowStart: pt("2026-07-27T07:00:00"),
    windowEnd: pt("2026-07-27T15:00:00"),
    completedNotes: "Jimmy: Completed north bank. Joe: Failed — vinyl peel on last panel.",
    failedReason: "Joe: Last panel peeled; needs remake.",
    completedAt: pt("2026-07-27T14:10:00"),
    createdAt: pt("2026-07-25T14:00:00"),
    updatedAt: pt("2026-07-27T14:10:00"),
    crew: [CREW.jimmy, CREW.joe],
    contacts: [
      { id: 124, isPoc: true },
      { id: 125 },
    ],
    crewEvents: [
      {
        userId: CREW.jimmy,
        type: "started",
        at: pt("2026-07-27T07:30:00"),
        lat: 36.107,
        lng: -115.177,
      },
      {
        userId: CREW.joe,
        type: "started",
        at: pt("2026-07-27T07:35:00"),
        lat: 36.107,
        lng: -115.177,
      },
      {
        userId: CREW.jimmy,
        type: "ended",
        at: pt("2026-07-27T13:50:00"),
        lat: 36.107,
        lng: -115.177,
      },
      {
        userId: CREW.joe,
        type: "ended",
        at: pt("2026-07-27T14:05:00"),
        lat: 36.107,
        lng: -115.177,
      },
    ],
    completionNotes: [
      {
        userId: CREW.jimmy,
        outcome: "Completed",
        notes: "North bank panels 1–8 OK.",
      },
      {
        userId: CREW.joe,
        outcome: "Failed",
        notes: "Panel 9 peeled within 20 min; stop and remake.",
      },
    ],
    attachments: [
      {
        kind: "photo",
        storageKey: EXISTING.photo,
        mimeType: "image/jpeg",
        fileName: "peel-issue.jpg",
        caption: "Panel 9 adhesion failure",
        uploadedBy: CREW.joe,
        at: pt("2026-07-27T14:00:00"),
      },
      {
        kind: "video",
        storageKey: EXISTING.video,
        mimeType: "video/mp4",
        fileName: "site-walk.mp4",
        uploadedBy: CREW.jimmy,
        at: pt("2026-07-27T13:40:00"),
      },
    ],
  },
  {
    id: 7,
    taskType: "Site Survey",
    status: "Completed",
    description:
      "Survey T-Mobile Arena concourse for upcoming LED totem install.\n" +
      "Measure clearances; note power locations; photos of proposed pads.",
    externalKey: "99410",
    createdBy: CREATORS.justin,
    destinationId: V.tMobile,
    crewSize: 1,
    hours: 2,
    isTimeSpecific: true,
    canStartEarly: false,
    windowStart: pt("2026-07-27T10:00:00"),
    windowEnd: pt("2026-07-27T12:00:00"),
    completedNotes: "Erin: Survey complete; sketch emailed to design.",
    completedAt: pt("2026-07-27T11:50:00"),
    createdAt: pt("2026-07-26T09:00:00"),
    updatedAt: pt("2026-07-27T11:50:00"),
    crew: [CREW.erin],
    contacts: [{ id: 117, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.erin,
        type: "started",
        at: pt("2026-07-27T10:05:00"),
        lat: 36.1027,
        lng: -115.1782,
      },
      {
        userId: CREW.erin,
        type: "ended",
        at: pt("2026-07-27T11:48:00"),
        lat: 36.1027,
        lng: -115.1782,
      },
    ],
    completionNotes: [
      {
        userId: CREW.erin,
        outcome: "Completed",
        notes: "3 pad options; power at column C4.",
      },
    ],
    attachments: [
      {
        kind: "photo",
        storageKey: EXISTING.photo,
        mimeType: "image/jpeg",
        fileName: "pad-option-a.jpg",
        uploadedBy: CREW.erin,
        at: pt("2026-07-27T11:20:00"),
      },
      {
        kind: "document",
        storageKey: EXISTING.pdf,
        mimeType: "application/pdf",
        fileName: "measure-notes.pdf",
        uploadedBy: CREW.erin,
        at: pt("2026-07-27T11:45:00"),
      },
    ],
  },
  {
    id: 8,
    taskType: "Delivery",
    status: "Completed",
    description:
      "Drop rigid banners to Luxor Marketing — dock A.\n" +
      "Call POC on arrival.",
    externalKey: "99418",
    createdBy: CREATORS.carmen,
    destinationId: V.luxor,
    crewSize: 1,
    hours: 1,
    windowStart: pt("2026-07-27T08:00:00"),
    windowEnd: pt("2026-07-27T12:00:00"),
    completedNotes: "Anthony: Left with Marketing.",
    completedAt: pt("2026-07-27T09:40:00"),
    createdAt: pt("2026-07-26T15:00:00"),
    updatedAt: pt("2026-07-27T09:40:00"),
    crew: [CREW.anthony],
    contacts: [
      { id: 118, isPoc: true },
      { id: 119 },
    ],
    crewEvents: [
      {
        userId: CREW.anthony,
        type: "started",
        at: pt("2026-07-27T08:50:00"),
        lat: 36.0955,
        lng: -115.1761,
      },
      {
        userId: CREW.anthony,
        type: "ended",
        at: pt("2026-07-27T09:35:00"),
        lat: 36.0955,
        lng: -115.1761,
      },
    ],
    completionNotes: [
      { userId: CREW.anthony, outcome: "Completed", notes: "Dock A, rack 3." },
    ],
    documents: [
      {
        kind: "delivery_docket",
        storageKey: EXISTING.docket,
        fileName: "delivery-docket-8.pdf",
        generatedAt: pt("2026-07-27T09:42:00"),
        generatedBy: CREATORS.carmen,
      },
    ],
    emails: [
      {
        trigger: "task_completed",
        to: "victoria.greene@example.com",
        subject: "Delivery complete — Task #8 Luxor",
        status: "sent",
        sentAt: pt("2026-07-27T09:43:00"),
      },
    ],
  },
  {
    id: 9,
    taskType: "Other",
    status: "Failed",
    description:
      "Appointment: walkthrough with client at Resorts World for future lobby wrap.\n" +
      "Client no-show after 45 min wait.",
    externalKey: "99425",
    createdBy: CREATORS.jed,
    destinationId: V.resortsWorld,
    crewSize: 1,
    hours: 1,
    isTimeSpecific: true,
    windowStart: pt("2026-07-27T14:00:00"),
    windowEnd: pt("2026-07-27T15:00:00"),
    failedReason: "Client no-show; reschedule requested.",
    completedAt: pt("2026-07-27T14:50:00"),
    createdAt: pt("2026-07-27T08:00:00"),
    updatedAt: pt("2026-07-27T14:50:00"),
    crew: [CREW.hernan],
    contacts: [{ id: 120, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.hernan,
        type: "started",
        at: pt("2026-07-27T13:55:00"),
        lat: 36.1335,
        lng: -115.165,
      },
      {
        userId: CREW.hernan,
        type: "ended",
        at: pt("2026-07-27T14:48:00"),
        lat: 36.1335,
        lng: -115.165,
      },
    ],
    completionNotes: [
      {
        userId: CREW.hernan,
        outcome: "Failed",
        notes: "Waited 45 min; left card with front desk.",
      },
    ],
  },
  {
    id: 10,
    taskType: "Removal",
    status: "Completed",
    description:
      "Strike temp directional at Palace Station valet.\n" +
      "Return hardware to shop bin R2.",
    externalKey: "99433",
    createdBy: CREATORS.thomas,
    destinationId: V.palaceStation,
    crewSize: 2,
    hours: 1.5,
    windowStart: pt("2026-07-27T16:00:00"),
    windowEnd: pt("2026-07-27T20:00:00"),
    completedNotes: "Greg + Marcelo: Strike done.",
    completedAt: pt("2026-07-27T18:20:00"),
    createdAt: pt("2026-07-26T12:00:00"),
    updatedAt: pt("2026-07-27T18:20:00"),
    crew: [CREW.greg, CREW.marcelo],
    contacts: [{ id: 121, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.greg,
        type: "started",
        at: pt("2026-07-27T16:30:00"),
        lat: 36.142,
        lng: -115.192,
      },
      {
        userId: CREW.marcelo,
        type: "started",
        at: pt("2026-07-27T16:32:00"),
        lat: 36.142,
        lng: -115.192,
      },
      {
        userId: CREW.greg,
        type: "ended",
        at: pt("2026-07-27T18:15:00"),
        lat: 36.142,
        lng: -115.192,
      },
      {
        userId: CREW.marcelo,
        type: "ended",
        at: pt("2026-07-27T18:18:00"),
        lat: 36.142,
        lng: -115.192,
      },
    ],
    completionNotes: [
      { userId: CREW.greg, outcome: "Completed", notes: "Hardware in R2." },
      { userId: CREW.marcelo, outcome: "Completed", notes: null },
    ],
  },

  // —— 7/28 Tuesday (today) — active board ——
  {
    id: 11,
    taskType: "Delivery",
    status: "In Progress",
    description:
      "28-GRAND-7701 - Deliver menu boards x6 to MGM Grand F&B dock.\n" +
      "Call Allie on arrival. Photo boards staged before handoff.",
    externalKey: "99501",
    createdBy: CREATORS.nikki,
    destinationId: V.mgmGrand,
    crewSize: 2,
    hours: 2,
    isTimeSpecific: false,
    canStartEarly: true,
    windowStart: pt("2026-07-28T08:00:00"),
    windowEnd: pt("2026-07-28T14:00:00"),
    createdAt: pt("2026-07-27T10:00:00"),
    updatedAt: pt("2026-07-28T09:15:00"),
    crew: [CREW.rick, CREW.david],
    contacts: [
      { id: 121, isPoc: true },
      { id: 117 },
    ],
    crewEvents: [
      {
        userId: CREW.rick,
        type: "started",
        at: pt("2026-07-28T09:10:00"),
        lat: 36.102,
        lng: -115.169,
      },
      {
        userId: CREW.david,
        type: "started",
        at: pt("2026-07-28T09:12:00"),
        lat: 36.102,
        lng: -115.169,
      },
    ],
    attachments: [
      {
        kind: "photo",
        storageKey: EXISTING.photo,
        mimeType: "image/jpeg",
        fileName: "truck-load.jpg",
        caption: "Boards loaded at shop",
        uploadedBy: CREW.rick,
        at: pt("2026-07-28T08:40:00"),
      },
    ],
    documents: [
      {
        kind: "shipping_label",
        storageKey: EXISTING.docket,
        fileName: "shipping-label-11.pdf",
        generatedAt: pt("2026-07-28T07:30:00"),
        generatedBy: CREATORS.nikki,
      },
    ],
  },
  {
    id: 12,
    taskType: "Install",
    status: "Loaded",
    description:
      "28-PARK-8820 - Install window cling set at Park MGM porte-cochère.\n" +
      "Material on truck. Arrive after 11:00 valet lull if possible.",
    externalKey: "99508",
    createdBy: CREATORS.carmen,
    destinationId: V.parkMgm,
    crewSize: 2,
    hours: 2.5,
    isTimeSpecific: false,
    canStartEarly: false,
    windowStart: pt("2026-07-28T11:00:00"),
    windowEnd: pt("2026-07-28T16:00:00"),
    createdAt: pt("2026-07-27T11:30:00"),
    updatedAt: pt("2026-07-28T08:00:00"),
    crew: [CREW.jimmy, CREW.nickS],
    contacts: [{ id: 119, isPoc: true }],
    emails: [
      {
        trigger: "task_assigned",
        to: "pamela.deblanc@example.com, jimmy@qcdlv.com",
        subject: "Crew assigned — Task #12 Park MGM install",
        status: "sent",
        sentAt: pt("2026-07-27T11:35:00"),
      },
    ],
  },
  {
    id: 13,
    taskType: "Pickup",
    status: "Assigned",
    description:
      "Pick up unused A-frames from Boulder Station marketing closet.\n" +
      "Ask for Victoria at security desk.",
    externalKey: "99512",
    createdBy: CREATORS.jed,
    destinationId: V.boulderStation,
    crewSize: 1,
    hours: 1,
    windowStart: pt("2026-07-28T13:00:00"),
    windowEnd: pt("2026-07-28T17:00:00"),
    createdAt: pt("2026-07-28T07:00:00"),
    updatedAt: pt("2026-07-28T07:05:00"),
    crew: [CREW.anthony],
    contacts: [{ id: 118, isPoc: true }],
  },
  {
    id: 14,
    taskType: "Delivery",
    status: "Assigned",
    description:
      "Deliver acrylic stands to City National Arena team store.\n" +
      "Time-specific: must arrive 2:00–2:30 PM before doors.",
    externalKey: "99520",
    createdBy: CREATORS.thomas,
    destinationId: V.cna,
    crewSize: 1,
    hours: 1,
    isTimeSpecific: true,
    canStartEarly: false,
    windowStart: pt("2026-07-28T14:00:00"),
    windowEnd: pt("2026-07-28T14:30:00"),
    createdAt: pt("2026-07-27T16:00:00"),
    updatedAt: pt("2026-07-28T08:30:00"),
    crew: [CREW.joe],
    contacts: [
      { id: 123, isPoc: true },
      { id: 124 },
    ],
  },
  {
    id: 15,
    taskType: "Site Survey",
    status: "In Progress",
    description:
      "Survey Sunset Station exterior for monument refresh.\n" +
      "Note lighting, setbacks, photo existing monument all sides.",
    externalKey: "99528",
    createdBy: CREATORS.justin,
    destinationId: V.sunsetStation,
    crewSize: 1,
    hours: 1.5,
    windowStart: pt("2026-07-28T09:00:00"),
    windowEnd: pt("2026-07-28T12:00:00"),
    createdAt: pt("2026-07-27T09:00:00"),
    updatedAt: pt("2026-07-28T09:40:00"),
    crew: [CREW.erin],
    contacts: [{ id: 125, isPoc: true }],
    crewEvents: [
      {
        userId: CREW.erin,
        type: "started",
        at: pt("2026-07-28T09:35:00"),
        lat: 36.062,
        lng: -115.042,
      },
    ],
  },
  {
    id: 16,
    taskType: "Install",
    status: "Loaded",
    description:
      "28-MUA-441 - Install VIP suite nameplates at Michelob ULTRA Arena.\n" +
      "Escort required — check in at security.",
    externalKey: "99535",
    createdBy: CREATORS.nikki,
    destinationId: V.muda,
    crewSize: 2,
    hours: 3,
    isTimeSpecific: true,
    canStartEarly: false,
    windowStart: pt("2026-07-28T15:00:00"),
    windowEnd: pt("2026-07-28T19:00:00"),
    createdAt: pt("2026-07-26T13:00:00"),
    updatedAt: pt("2026-07-28T10:00:00"),
    crew: [CREW.hernan, CREW.greg],
    contacts: [{ id: 120, isPoc: true }],
  },

  // —— 7/29 Wednesday ——
  {
    id: 17,
    taskType: "Delivery",
    status: "Assigned",
    description:
      "29-PALZ-901 - Deliver fabric tension frames to Palazzo receiving.\n" +
      "Fragile — upright only. Photo after staging.",
    externalKey: "99601",
    createdBy: CREATORS.carmen,
    destinationId: V.palazzo,
    crewSize: 2,
    hours: 2,
    canStartEarly: true,
    windowStart: pt("2026-07-29T08:00:00"),
    windowEnd: pt("2026-07-29T13:00:00"),
    createdAt: pt("2026-07-28T09:00:00"),
    updatedAt: pt("2026-07-28T09:10:00"),
    crew: [CREW.rick, CREW.marcelo],
    contacts: [
      { id: 117, isPoc: true },
      { id: 121 },
    ],
  },
  {
    id: 18,
    taskType: "Removal",
    status: "Assigned",
    description:
      "Remove expired Fremont Street Container Park sandwich boards (client-owned).\n" +
      "Return to shop for reprint.",
    externalKey: "99608",
    createdBy: CREATORS.jed,
    destinationId: V.containerPark,
    crewSize: 1,
    hours: 1,
    windowStart: pt("2026-07-29T10:00:00"),
    windowEnd: pt("2026-07-29T14:00:00"),
    createdAt: pt("2026-07-28T10:00:00"),
    updatedAt: pt("2026-07-28T10:05:00"),
    crew: [CREW.david],
    contacts: [{ id: 118, isPoc: true }],
  },
  {
    id: 19,
    taskType: "Install",
    status: "Unassigned",
    description:
      "29-GGA-112 - Grand Garden Arena tunnel graphics install.\n" +
      "Crew TBD — waiting on overtime approval. Scaffolding on site.",
    externalKey: "99615",
    createdBy: CREATORS.thomas,
    destinationId: V.gga,
    crewSize: 3,
    hours: 5,
    isTimeSpecific: true,
    canStartEarly: false,
    windowStart: pt("2026-07-29T06:00:00"),
    windowEnd: pt("2026-07-29T12:00:00"),
    createdAt: pt("2026-07-27T15:00:00"),
    updatedAt: pt("2026-07-28T08:00:00"),
    crew: [],
    contacts: [
      { id: 119, isPoc: true },
      { id: 124 },
      { id: 125 },
    ],
  },
  {
    id: 20,
    taskType: "Pickup",
    status: "Assigned",
    description:
      "Pickup leftover materials from Cirque after Monday install.\n" +
      "Confirm with warehouse before rolling.",
    externalKey: "99622",
    createdBy: CREATORS.nikki,
    destinationId: V.cirque,
    crewSize: 1,
    hours: 1,
    windowStart: pt("2026-07-29T14:00:00"),
    windowEnd: pt("2026-07-29T17:00:00"),
    createdAt: pt("2026-07-28T11:00:00"),
    updatedAt: pt("2026-07-28T11:00:00"),
    crew: [CREW.nickS],
    contacts: [{ id: 123, isPoc: true }],
  },
  {
    id: 21,
    taskType: "Other",
    status: "Assigned",
    description:
      "Internal: photo documentation of shop inventory for upcoming Aces job.\n" +
      "No destination — work at shop. Attach inventory sheet when done.",
    externalKey: "99630",
    createdBy: CREATORS.justin,
    destinationId: null,
    crewSize: 1,
    hours: 2,
    isTimeSpecific: false,
    canStartEarly: true,
    windowStart: pt("2026-07-29T08:00:00"),
    windowEnd: pt("2026-07-29T12:00:00"),
    createdAt: pt("2026-07-28T07:30:00"),
    updatedAt: pt("2026-07-28T07:30:00"),
    crew: [CREW.erin],
    contacts: [],
  },

  // —— 7/30 Thursday ——
  {
    id: 22,
    taskType: "Delivery",
    status: "Assigned",
    description:
      "30-MBAY-9901 - Deliver LED totem crates to Mandalay Bay loading dock 3.\n" +
      "Forklift on site. Shipping label already printed.",
    externalKey: "99701",
    createdBy: CREATORS.carmen,
    destinationId: V.mbay,
    crewSize: 2,
    hours: 2,
    windowStart: pt("2026-07-30T07:00:00"),
    windowEnd: pt("2026-07-30T12:00:00"),
    createdAt: pt("2026-07-28T12:00:00"),
    updatedAt: pt("2026-07-28T12:05:00"),
    crew: [CREW.jimmy, CREW.joe],
    contacts: [{ id: 117, isPoc: true }],
    documents: [
      {
        kind: "shipping_label",
        storageKey: EXISTING.docket,
        fileName: "shipping-label-22.pdf",
        generatedAt: pt("2026-07-28T12:10:00"),
        generatedBy: CREATORS.carmen,
      },
      {
        kind: "delivery_docket",
        storageKey: EXISTING.docket,
        fileName: "delivery-docket-22.pdf",
        generatedAt: pt("2026-07-28T12:11:00"),
        generatedBy: CREATORS.carmen,
      },
    ],
  },
  {
    id: 23,
    taskType: "Install",
    status: "Unassigned",
    description:
      "30-ARIA-5600 - Install refreshed escalator wrap (remake from Undetermined #6).\n" +
      "Assign after remake QC clears.",
    externalKey: "99708",
    createdBy: CREATORS.nikki,
    destinationId: V.aria,
    crewSize: 2,
    hours: 3,
    canStartEarly: true,
    windowStart: pt("2026-07-30T07:00:00"),
    windowEnd: pt("2026-07-30T14:00:00"),
    createdAt: pt("2026-07-28T14:30:00"),
    updatedAt: pt("2026-07-28T14:30:00"),
    crew: [],
    contacts: [
      { id: 124, isPoc: true },
      { id: 125 },
    ],
  },
  {
    id: 24,
    taskType: "Site Survey",
    status: "Assigned",
    description:
      "Survey Bellagio fountain plaza for temporary event fencing graphics.\n" +
      "Meet POC at porte-cochère 9:00 sharp.",
    externalKey: "99715",
    createdBy: CREATORS.thomas,
    destinationId: V.bellagio,
    crewSize: 1,
    hours: 1.5,
    isTimeSpecific: true,
    windowStart: pt("2026-07-30T09:00:00"),
    windowEnd: pt("2026-07-30T10:30:00"),
    createdAt: pt("2026-07-28T15:00:00"),
    updatedAt: pt("2026-07-28T15:00:00"),
    crew: [CREW.hernan],
    contacts: [{ id: 120, isPoc: true }],
  },
  {
    id: 25,
    taskType: "Removal",
    status: "Assigned",
    description:
      "Strike VIP suite nameplates after event at Michelob ULTRA Arena.\n" +
      "Bag returned panels carefully for reuse.",
    externalKey: "99722",
    createdBy: CREATORS.jed,
    destinationId: V.muda,
    crewSize: 2,
    hours: 2,
    windowStart: pt("2026-07-30T20:00:00"),
    windowEnd: pt("2026-07-30T23:00:00"),
    createdAt: pt("2026-07-28T16:00:00"),
    updatedAt: pt("2026-07-28T16:00:00"),
    crew: [CREW.greg, CREW.anthony],
    contacts: [{ id: 121, isPoc: true }],
  },
  {
    id: 26,
    taskType: "Delivery",
    status: "Unassigned",
    description:
      "Hold for address confirmation — client may change dock.\n" +
      "Materials ready in shop bay 4. No destination yet.",
    externalKey: "99730",
    createdBy: CREATORS.justin,
    destinationId: null,
    crewSize: 1,
    hours: 1,
    windowStart: pt("2026-07-30T10:00:00"),
    windowEnd: pt("2026-07-30T16:00:00"),
    createdAt: pt("2026-07-28T16:30:00"),
    updatedAt: pt("2026-07-28T16:30:00"),
    crew: [],
    contacts: [{ id: 119, isPoc: true }],
  },

  // —— 7/31 Friday ——
  {
    id: 27,
    taskType: "Install",
    status: "Assigned",
    description:
      "31-TMA-301 - Install LED totems at T-Mobile Arena (from Tue survey).\n" +
      "Power confirmed at C4. Early start OK if escort available.",
    externalKey: "99801",
    createdBy: CREATORS.thomas,
    destinationId: V.tMobile,
    crewSize: 3,
    hours: 4,
    isTimeSpecific: false,
    canStartEarly: true,
    windowStart: pt("2026-07-31T06:00:00"),
    windowEnd: pt("2026-07-31T14:00:00"),
    createdAt: pt("2026-07-28T17:00:00"),
    updatedAt: pt("2026-07-28T17:05:00"),
    crew: [CREW.jimmy, CREW.joe, CREW.david],
    contacts: [
      { id: 117, isPoc: true },
      { id: 125 },
    ],
    emails: [
      {
        trigger: "task_assigned",
        to: "jordan.butler@example.com, jimmy@qcdlv.com",
        subject: "Crew assigned — Task #27 T-Mobile Arena install",
        status: "pending",
        sentAt: null,
      },
    ],
  },
  {
    id: 28,
    taskType: "Delivery",
    status: "Assigned",
    description:
      "Friday AM drop — Aces HQ wall wraps tubes.\n" +
      "Call Vincent 30 min out.",
    externalKey: "99808",
    createdBy: CREATORS.nikki,
    destinationId: V.aces,
    crewSize: 1,
    hours: 1,
    isTimeSpecific: true,
    windowStart: pt("2026-07-31T08:00:00"),
    windowEnd: pt("2026-07-31T09:00:00"),
    createdAt: pt("2026-07-28T17:15:00"),
    updatedAt: pt("2026-07-28T17:15:00"),
    crew: [CREW.rick],
    contacts: [{ id: 123, isPoc: true }],
  },
  {
    id: 29,
    taskType: "Pickup",
    status: "Unassigned",
    description:
      "End-of-week pickup run — collect returns from Luxor Marketing.\n" +
      "Assign Friday morning once truck availability known.",
    externalKey: "99815",
    createdBy: CREATORS.carmen,
    destinationId: V.luxor,
    crewSize: 1,
    hours: 1.5,
    windowStart: pt("2026-07-31T13:00:00"),
    windowEnd: pt("2026-07-31T17:00:00"),
    createdAt: pt("2026-07-28T17:30:00"),
    updatedAt: pt("2026-07-28T17:30:00"),
    crew: [],
    contacts: [
      { id: 118, isPoc: true },
      { id: 119 },
    ],
  },
  {
    id: 30,
    taskType: "Other",
    status: "Cancelled",
    description:
      "Soft-deleted cancelled appointment (kept for delete-filter testing).\n" +
      "Was a Resorts World walkthrough — cancelled and then soft-deleted.",
    externalKey: "99822",
    createdBy: CREATORS.jed,
    destinationId: V.resortsWorld,
    crewSize: 1,
    hours: 1,
    isTimeSpecific: true,
    windowStart: pt("2026-07-31T11:00:00"),
    windowEnd: pt("2026-07-31T12:00:00"),
    createdAt: pt("2026-07-28T18:00:00"),
    updatedAt: pt("2026-07-28T18:30:00"),
    deletedAt: pt("2026-07-28T18:30:00"),
    crew: [CREW.hernan],
    contacts: [{ id: 120, isPoc: true }],
    emails: [
      {
        trigger: "task_cancelled",
        to: "gabriel.yudis@example.com",
        subject: "Task #30 Cancelled",
        status: "failed",
        sentAt: null,
        error: "Mailbox full (simulated seed failure)",
      },
    ],
  },
];

async function enrichContacts(client) {
  const updates = [
    [117, "Receiving Lead", "7027733496", "jordan.butler@example.com"],
    [118, "Marketing Coordinator", "7025568615", "victoria.greene@example.com"],
    [119, "Electrical Manager", "7022106259", "pamela.deblanc@example.com"],
    [120, "Events Manager", "3108717559", "gabriel.yudis@example.com"],
    [121, "F&B Ops", "7022185804", "allie.goldberg@example.com"],
    [123, "Facilities", "7025247285", "vincent.pangelinan@example.com"],
    [124, "Project Manager", "9499227141", "jose.villar@example.com"],
    [125, "Brand Manager", "7736339499", "nicole.soltyszekski@example.com"],
  ];
  for (const [id, title, phone, email] of updates) {
    await client.query(
      `UPDATE contacts
       SET title = $2, phone = $3, email = $4, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, title, phone, email],
    );
  }
}

/**
 * @param {import('pg').Client} client
 * @param {SeedTask} t
 */
async function insertTask(client, t) {
  const publicToken = randomBytes(32).toString("base64url");
  await client.query(
    `INSERT INTO tasks (
       id, task_type, status, description, external_key, created_by_user_id,
       destination_address_id, crew_size, estimated_hours,
       is_time_specific, can_start_early, window_start_at, window_end_at,
       completed_notes, completed_at, failed_reason,
       deleted_at, created_at, updated_at, public_token
     ) VALUES (
       $1, $2::task_type, $3::task_status, $4, $5, $6::uuid,
       $7, $8, $9,
       $10, $11, $12::timestamptz, $13::timestamptz,
       $14, $15::timestamptz, $16,
       $17::timestamptz, $18::timestamptz, $19::timestamptz, $20
     )`,
    [
      t.id,
      t.taskType,
      t.status,
      t.description,
      t.externalKey ?? null,
      t.createdBy,
      t.destinationId ?? null,
      t.crewSize ?? null,
      t.hours ?? null,
      t.isTimeSpecific ?? false,
      t.canStartEarly ?? false,
      t.windowStart ?? null,
      t.windowEnd ?? null,
      t.completedNotes ?? null,
      t.completedAt ?? null,
      t.failedReason ?? null,
      t.deletedAt ?? null,
      t.createdAt,
      t.updatedAt,
      publicToken,
    ],
  );

  for (const [index, userId] of (t.crew ?? []).entries()) {
    await client.query(
      `INSERT INTO task_crew_members (task_id, user_id, is_lead) VALUES ($1, $2::uuid, $3)`,
      [t.id, userId, index === 0],
    );
  }

  for (const c of t.contacts ?? []) {
    await client.query(
      `INSERT INTO task_contacts (task_id, contact_id, is_poc, receives_email)
       VALUES ($1, $2, $3, $4)`,
      [
        t.id,
        c.id,
        Boolean(c.isPoc),
        c.receivesEmail != null ? Boolean(c.receivesEmail) : Boolean(c.isPoc),
      ],
    );
  }

  for (const e of t.crewEvents ?? []) {
    await client.query(
      `INSERT INTO task_crew_events (
         task_id, user_id, event_type, latitude, longitude, accuracy_meters, recorded_at
       ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::timestamptz)`,
      [
        t.id,
        e.userId,
        e.type,
        e.lat ?? null,
        e.lng ?? null,
        e.lat != null ? 12.5 : null,
        e.at,
      ],
    );
  }

  for (const n of t.completionNotes ?? []) {
    await client.query(
      `INSERT INTO task_completion_notes (task_id, user_id, outcome, notes)
       VALUES ($1, $2::uuid, $3, $4)`,
      [t.id, n.userId, n.outcome, n.notes ?? null],
    );
  }

  for (const a of t.attachments ?? []) {
    await client.query(
      `INSERT INTO task_attachments (
         task_id, uploaded_by_user_id, kind, storage_key, mime_type,
         file_name, file_size_bytes, caption, created_at
       ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
      [
        t.id,
        a.uploadedBy,
        a.kind,
        a.storageKey,
        a.mimeType,
        a.fileName,
        125000,
        a.caption ?? null,
        a.at,
      ],
    );
  }

  for (const d of t.documents ?? []) {
    await client.query(
      `INSERT INTO task_documents (
         task_id, kind, storage_key, file_name, generated_at, generated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::uuid)`,
      [
        t.id,
        d.kind,
        d.storageKey,
        d.fileName,
        d.generatedAt,
        d.generatedBy ?? null,
      ],
    );
  }

  for (const m of t.emails ?? []) {
    await client.query(
      `INSERT INTO email_deliveries (
         task_id, "trigger", to_addresses, subject, status,
         provider_message_id, error_message, sent_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
      [
        t.id,
        m.trigger,
        m.to,
        m.subject,
        m.status,
        m.status === "sent" ? `seed-${t.id}-${m.trigger}` : null,
        m.error ?? null,
        m.sentAt ?? null,
      ],
    );
  }
}

async function main() {
  if (TASKS.length !== 30) {
    throw new Error(`Expected 30 seed tasks, got ${TASKS.length}`);
  }

  const client = createPgClient();
  await client.connect();

  try {
    if (dryRun) {
      console.log(`Dry run: would wipe tasks and insert ${TASKS.length} seeds`);
      console.log(
        "Statuses:",
        Object.fromEntries(
          [...new Set(TASKS.map((t) => t.status))].map((s) => [
            s,
            TASKS.filter((t) => t.status === s).length,
          ]),
        ),
      );
      console.log(
        "Types:",
        Object.fromEntries(
          [...new Set(TASKS.map((t) => t.taskType))].map((s) => [
            s,
            TASKS.filter((t) => t.taskType === s).length,
          ]),
        ),
      );
      return;
    }

    await client.query("BEGIN");

    const before = await client.query(`SELECT count(*)::int AS c FROM tasks`);
    console.log(`Wiping ${before.rows[0].c} existing tasks…`);

    // NO ACTION children first
    await client.query(`DELETE FROM task_attachments`);
    await client.query(`DELETE FROM task_documents`);
    await client.query(`DELETE FROM email_deliveries`);
    await client.query(`DELETE FROM task_crew_events`);
    await client.query(`DELETE FROM task_history_events`);
    // CASCADE children + tasks
    await client.query(`DELETE FROM tasks`);

    await enrichContacts(client);

    for (const t of TASKS) {
      await insertTask(client, t);
    }

    await client.query(
      `SELECT setval(pg_get_serial_sequence('tasks', 'id'), (SELECT MAX(id) FROM tasks))`,
    );

    await client.query("COMMIT");

    const summary = await client.query(`
      SELECT status::text AS status, count(*)::int AS c
      FROM tasks
      WHERE deleted_at IS NULL
      GROUP BY status
      ORDER BY status
    `);
    const soft = await client.query(
      `SELECT count(*)::int AS c FROM tasks WHERE deleted_at IS NOT NULL`,
    );
    console.log(`Inserted ${TASKS.length} tasks (1 soft-deleted).`);
    console.log("Active by status:", Object.fromEntries(summary.rows.map((r) => [r.status, r.c])));
    console.log("Soft-deleted:", soft.rows[0].c);
    console.log("Also enriched contact titles/emails for POC + email features.");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    await client.end();
  }
}

await main();
