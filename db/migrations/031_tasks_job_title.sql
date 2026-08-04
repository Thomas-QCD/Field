-- Short job title, split out from task description (TaskDesc).

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS job_title varchar(255);

COMMIT;
