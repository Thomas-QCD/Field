-- Soft-delete via deleted_at; drop contacts.is_active (replaced by deleted_at)

BEGIN;

ALTER TABLE contacts  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE contacts DROP COLUMN IF EXISTS is_active;

COMMIT;
