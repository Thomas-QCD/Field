-- Store task status and type as PostgreSQL enums (text labels) on tasks.
-- Replaces status_id / task_type_id FK columns.
-- Values match reference export / app types (e.g. Delivery, Loaded).

BEGIN;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM (
    'Delivery',
    'Install',
    'Removal',
    'Site Survey',
    'Other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'Created',
    'Unassigned',
    'Assigned',
    'Loaded',
    'Arrived',
    'Completed',
    'Failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'task_type_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN task_type task_type;
    ALTER TABLE tasks ADD COLUMN status task_status;

    UPDATE tasks AS t
    SET
      task_type = CASE lower(tt.code)
        WHEN 'delivery' THEN 'Delivery'::task_type
        WHEN 'install' THEN 'Install'::task_type
        WHEN 'removal' THEN 'Removal'::task_type
        WHEN 'site_survey' THEN 'Site Survey'::task_type
        WHEN 'other' THEN 'Other'::task_type
      END,
      status = CASE lower(ts.code)
        WHEN 'created' THEN 'Created'::task_status
        WHEN 'unassigned' THEN 'Unassigned'::task_status
        WHEN 'assigned' THEN 'Assigned'::task_status
        WHEN 'loaded' THEN 'Loaded'::task_status
        WHEN 'arrived' THEN 'Arrived'::task_status
        WHEN 'completed' THEN 'Completed'::task_status
        WHEN 'failed' THEN 'Failed'::task_status
      END
    FROM task_types AS tt, task_statuses AS ts
    WHERE t.task_type_id = tt.id
      AND t.status_id = ts.id;

    ALTER TABLE tasks ALTER COLUMN task_type SET NOT NULL;
    ALTER TABLE tasks ALTER COLUMN status SET NOT NULL;

    DROP INDEX IF EXISTS tasks_status_crew_idx;
    DROP INDEX IF EXISTS tasks_status_window_idx;

    ALTER TABLE tasks DROP COLUMN task_type_id;
    ALTER TABLE tasks DROP COLUMN status_id;

    CREATE INDEX tasks_status_window_idx ON tasks (status, window_start_at, window_end_at);
    -- tasks_status_crew_idx dropped with assigned_crew_user_id in 006
  END IF;
END $$;

-- Ensure dispatch address is gone (also covered by 004).
ALTER TABLE tasks DROP COLUMN IF EXISTS dispatch_address_id;

COMMIT;
