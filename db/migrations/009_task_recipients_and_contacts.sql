-- Contacts = recipients (single email column). Drop recipient_emails.
-- Assign 0..many contacts via task_recipients (mirrors task_crew_members).
-- Tasks link 0..1 destination address via destination_address_id.
-- Remove task-owned recipient/destination text and recipients.default_address_id.

BEGIN;

-- 1. Single email on the contact row
ALTER TABLE recipients
  ADD COLUMN IF NOT EXISTS email varchar(255);

UPDATE recipients AS r
SET email = COALESCE(
  r.email,
  (
    SELECT e.email
    FROM recipient_emails e
    WHERE e.recipient_id = r.id
    ORDER BY e.is_primary DESC, e.id
    LIMIT 1
  )
)
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'recipient_emails'
);

-- 2. Junction: contacts on a task
CREATE TABLE IF NOT EXISTS task_recipients (
  task_id bigint NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  recipient_id bigint NOT NULL REFERENCES recipients (id),
  PRIMARY KEY (task_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS task_recipients_recipient_idx
  ON task_recipients (recipient_id);

-- Migrate soft-link recipient_id → junction
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'recipient_id'
  ) THEN
    INSERT INTO task_recipients (task_id, recipient_id)
    SELECT id, recipient_id
    FROM tasks
    WHERE recipient_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. Restore 0..1 destination FK; backfill from task text columns if present
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS destination_address_id bigint REFERENCES addresses (id);

DO $$
DECLARE
  t RECORD;
  new_address_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'destination_address'
  ) THEN
    FOR t IN
      SELECT
        id,
        destination_address,
        destination_building,
        destination_notes
      FROM tasks
      WHERE destination_address_id IS NULL
        AND destination_address IS NOT NULL
        AND btrim(destination_address) <> ''
    LOOP
      INSERT INTO addresses (street_line, building, notes)
      VALUES (
        left(t.destination_address, 500),
        NULLIF(btrim(COALESCE(t.destination_building, '')), ''),
        NULLIF(btrim(COALESCE(t.destination_notes, '')), '')
      )
      RETURNING id INTO new_address_id;

      UPDATE tasks
      SET destination_address_id = new_address_id
      WHERE id = t.id;
    END LOOP;
  END IF;
END $$;

-- 4. Drop denormalized task recipient/destination columns and old FK
DROP INDEX IF EXISTS tasks_recipient_id_idx;

ALTER TABLE tasks
  DROP COLUMN IF EXISTS recipient_id,
  DROP COLUMN IF EXISTS recipient_name,
  DROP COLUMN IF EXISTS recipient_phone,
  DROP COLUMN IF EXISTS recipient_email,
  DROP COLUMN IF EXISTS destination_address,
  DROP COLUMN IF EXISTS destination_building,
  DROP COLUMN IF EXISTS destination_notes;

-- 5. Contacts are separate from addresses
ALTER TABLE recipients
  DROP COLUMN IF EXISTS default_address_id;

DROP TABLE IF EXISTS recipient_emails;

COMMIT;
