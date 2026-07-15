# Critical Features

Features confirmed as **critical** for Field — required for parity with the licensed product and for a minimum functioning delivery workflow. These are not optional add-ons.

See also: [`task-model.md`](task-model.md), [`database-design.md`](database-design.md), [`sdd.md`](sdd.md).

---

## 1. PDF Document Generation

The system must generate PDF documents tied to tasks. Three document types are critical:

| Document | Purpose | Typical timing (TBD) |
|----------|---------|----------------------|
| **Shipping label** | Label for physical shipment / load identification | On assign or load (e.g. status → `loaded`) |
| **Delivery docket** | Instructions and details for the driver / job packet | On assign or before execution |
| **POD** (proof of delivery) | Completion record — may include photos, notes, signature | On task completion |

**Requirements (draft):**

- PDFs are **generated server-side** from task data (and completion data for POD).
- Store generated files via storage provider — **local `./storage/documents` in dev**; **S3 in production**. Metadata in `task_documents`.
- Web users can **view and download** PDFs; mobile executors may **view/print** docket and submit data that feeds POD generation.
- POD likely incorporates `task_attachments` (photos) and `completed_notes` / `completed_at`.

**Not yet defined:**

- Exact trigger per document type (status change, manual button, both).
- PDF layout/templates — need samples from licensed product or brand guidelines.
- Whether shipping label integrates with a carrier API or is an internal printable label only.

**Likely implementation:**

- Template-based PDF generation in the API layer (e.g. PDFKit, `@react-pdf/renderer` on server, or HTML → PDF).
- One template per document type; version templates as requirements stabilize.

---

## 2. Automatic Email Sending

The system must **send emails automatically** without manual copy/paste. Recipients and triggers are tied to tasks.

**Known data sources:**

- `recipient_emails` — one or more addresses per recipient (reference used comma-separated emails).
- Task fields — description, scheduling window, destination, status, links to PDFs.

**Requirements (draft):**

- Emails send **automatically** on defined events (exact list TBD — e.g. task assigned, loaded, completed, POD available).
- Log every send attempt in `email_deliveries` for audit and retry.
- Failed sends should be retryable; do not silently drop.

**Not yet defined:**

- Which events trigger which email templates.
- Whether executors or internal staff receive emails in addition to external recipients.
- From-address, reply-to, and branding (SES verified domain when on AWS; not required locally)

**Email delivery:**

| Environment | Provider |
|-------------|----------|
| Local dev | Console log, file, or Mailpit |
| Production | **Amazon SES** |

Templates: inline in code or DB for MVP. Async dispatch optional locally; SQS + Lambda when on AWS.

**Example triggers (confirm with operations):**

| Event | Possible email |
|-------|------------------|
| Task assigned | Notify driver (if email on file) or dispatch only |
| Task loaded | Delivery docket / label to driver or warehouse |
| Task completed | POD or completion notice to `recipient_emails` |
| Task failed | Alert to creator / recipient |

---

## Relationship to Task Lifecycle

```text
create task → assign → [delivery docket PDF] → loaded → [shipping label PDF]
    → execute → complete + photos → [POD PDF] → [automatic emails at key steps]
```

PDF generation and email sending are **downstream of task state**. Design status transitions and completion flows first; hook documents and emails into those events.

---

## MVP Note

These features are **critical**, but template polish and every possible trigger do not all need to ship on day one. Minimum acceptable MVP:

1. At least **one PDF type** generating correctly from real task data.
2. At least **one automatic email** on a defined event (e.g. completion → recipient).
3. Logging/storage for generated PDFs and sent emails.

Expand to all three PDF types and full trigger matrix once the pipeline works end-to-end.

---

## Open Questions

- Sample PDFs from the licensed product for each document type?
- Which email events are mandatory for go-live vs later?
- Include PDF as attachment, link only, or both?
- SMS required later, or email only for now?
