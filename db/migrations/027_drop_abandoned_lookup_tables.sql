-- Drop unused type/status lookup tables and unwired status audit log.
-- Source of truth is task_type / task_status enums on tasks; crew timeline is task_crew_events.
-- See docs/database-design.md

BEGIN;

DROP TABLE IF EXISTS task_status_transitions;
DROP TABLE IF EXISTS task_status_events;
DROP TABLE IF EXISTS task_types;
DROP TABLE IF EXISTS task_statuses;

COMMIT;
