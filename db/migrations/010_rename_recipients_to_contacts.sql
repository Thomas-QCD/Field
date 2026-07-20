-- Rename recipients → contacts (table, junction, indexes).
-- Historical migrations keep old names; this is the live rename.

BEGIN;

ALTER TABLE IF EXISTS recipients RENAME TO contacts;

ALTER TABLE IF EXISTS task_recipients RENAME TO task_contacts;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_contacts'
      AND column_name = 'recipient_id'
  ) THEN
    ALTER TABLE task_contacts RENAME COLUMN recipient_id TO contact_id;
  END IF;
END $$;

ALTER INDEX IF EXISTS task_recipients_recipient_idx
  RENAME TO task_contacts_contact_idx;

COMMIT;
