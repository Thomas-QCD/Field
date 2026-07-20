-- Tasks own recipient + destination fields for per-task fine-tuning.
-- recipients / addresses remain master data for search/autocomplete only.
-- Selecting a recipient pre-fills the form; submit writes onto the task row.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recipient_name varchar(255),
  ADD COLUMN IF NOT EXISTS recipient_phone varchar(50),
  ADD COLUMN IF NOT EXISTS recipient_email varchar(255),
  ADD COLUMN IF NOT EXISTS destination_address varchar(500),
  ADD COLUMN IF NOT EXISTS destination_building varchar(255),
  ADD COLUMN IF NOT EXISTS destination_notes text;

-- Backfill from normalized tables for any existing rows.
UPDATE tasks AS t
SET
  recipient_name = COALESCE(t.recipient_name, r.name),
  recipient_phone = COALESCE(t.recipient_phone, r.phone),
  recipient_email = COALESCE(
    t.recipient_email,
    (
      SELECT e.email
      FROM recipient_emails e
      WHERE e.recipient_id = r.id
      ORDER BY e.is_primary DESC, e.id
      LIMIT 1
    )
  )
FROM recipients AS r
WHERE t.recipient_id = r.id;

UPDATE tasks AS t
SET
  destination_address = COALESCE(t.destination_address, a.street_line),
  destination_building = COALESCE(t.destination_building, a.building),
  destination_notes = COALESCE(t.destination_notes, a.notes)
FROM addresses AS a
WHERE t.destination_address_id = a.id;

ALTER TABLE tasks DROP COLUMN IF EXISTS destination_address_id;

COMMIT;
