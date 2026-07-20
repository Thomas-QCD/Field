-- Terminology: Field uses "crew member", not "driver".
-- Reference AssignedToDriverUserId maps to assigned_crew_user_id.

BEGIN;

ALTER TABLE tasks RENAME COLUMN assigned_driver_user_id TO assigned_crew_user_id;

ALTER INDEX IF EXISTS tasks_status_driver_idx RENAME TO tasks_status_crew_idx;

COMMIT;
