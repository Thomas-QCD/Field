-- Informational urgent flag on tasks (no workflow side effects).

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

COMMIT;
