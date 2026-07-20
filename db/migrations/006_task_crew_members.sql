-- Multiple crew members per task (replaces single assigned_crew_user_id).
-- API/form shape: crewMemberIds: string[]

BEGIN;

CREATE TABLE IF NOT EXISTS task_crew_members (
  task_id bigint NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS task_crew_members_user_idx ON task_crew_members (user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'assigned_crew_user_id'
  ) THEN
    INSERT INTO task_crew_members (task_id, user_id)
    SELECT id, assigned_crew_user_id
    FROM tasks
    WHERE assigned_crew_user_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    DROP INDEX IF EXISTS tasks_status_crew_idx;

    ALTER TABLE tasks DROP COLUMN assigned_crew_user_id;
  END IF;
END $$;

COMMIT;
