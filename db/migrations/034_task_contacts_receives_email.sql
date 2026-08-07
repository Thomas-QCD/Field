-- Per-contact flag: whether this contact receives automated task emails.
-- POC defaults to true; other contacts default to false.

BEGIN;

ALTER TABLE task_contacts
  ADD COLUMN IF NOT EXISTS receives_email boolean NOT NULL DEFAULT false;

-- Backfill: POC contacts receive email; others do not.
UPDATE task_contacts
SET receives_email = is_poc
WHERE receives_email IS DISTINCT FROM is_poc;

COMMIT;
