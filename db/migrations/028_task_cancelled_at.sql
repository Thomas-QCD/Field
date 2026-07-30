-- Track when a task was cancelled for the 7-day restore / purge window.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS status_before_cancel task_status NULL;

UPDATE tasks
SET cancelled_at = COALESCE(updated_at, created_at)
WHERE status = 'Cancelled'
  AND cancelled_at IS NULL
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_cancelled_purge_idx
  ON tasks (cancelled_at)
  WHERE status = 'Cancelled'
    AND deleted_at IS NULL;

COMMIT;
