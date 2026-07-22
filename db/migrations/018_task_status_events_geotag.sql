-- Crew GPS at task start/end status transitions (compare to addresses lat/lng).

BEGIN;

ALTER TABLE task_status_events
  ADD COLUMN IF NOT EXISTS latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS accuracy_meters numeric(8, 2),
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz;

COMMIT;
