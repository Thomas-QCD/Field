-- Equipment list on Install / Removal / Site Survey tasks (0..many).
-- Replaces free-text "Equipment List: …" in descriptions. Empty = none.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS equipment text[] NOT NULL DEFAULT '{}';

COMMIT;
