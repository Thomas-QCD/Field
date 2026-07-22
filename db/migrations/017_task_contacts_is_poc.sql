-- One point of contact (POC) per task among assigned contacts.
-- Typically the first contact added; stored as is_poc on task_contacts.

BEGIN;

ALTER TABLE task_contacts
  ADD COLUMN IF NOT EXISTS is_poc boolean NOT NULL DEFAULT false;

-- Backfill: pick one contact per task (lowest contact_id) as POC.
UPDATE task_contacts tc
SET is_poc = true
FROM (
  SELECT DISTINCT ON (task_id) task_id, contact_id
  FROM task_contacts
  ORDER BY task_id, contact_id
) first_contact
WHERE tc.task_id = first_contact.task_id
  AND tc.contact_id = first_contact.contact_id
  AND NOT EXISTS (
    SELECT 1
    FROM task_contacts existing
    WHERE existing.task_id = tc.task_id
      AND existing.is_poc = true
  );

CREATE UNIQUE INDEX IF NOT EXISTS task_contacts_one_poc_per_task
  ON task_contacts (task_id)
  WHERE is_poc;

COMMIT;
