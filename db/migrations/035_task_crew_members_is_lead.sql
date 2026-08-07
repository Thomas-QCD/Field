-- One lead crew member per task among assigned crew.
-- Typically the first crew member added; stored as is_lead on task_crew_members.
-- Remaining assigned crew are sub (is_lead = false). Informational for now.

BEGIN;

ALTER TABLE task_crew_members
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

-- Backfill: pick one crew member per task (lowest user_id) as lead.
UPDATE task_crew_members tcm
SET is_lead = true
FROM (
  SELECT DISTINCT ON (task_id) task_id, user_id
  FROM task_crew_members
  ORDER BY task_id, user_id
) first_crew
WHERE tcm.task_id = first_crew.task_id
  AND tcm.user_id = first_crew.user_id
  AND NOT EXISTS (
    SELECT 1
    FROM task_crew_members existing
    WHERE existing.task_id = tcm.task_id
      AND existing.is_lead = true
  );

CREATE UNIQUE INDEX IF NOT EXISTS task_crew_members_one_lead_per_task
  ON task_crew_members (task_id)
  WHERE is_lead;

COMMIT;
