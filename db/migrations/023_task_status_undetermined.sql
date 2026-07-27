-- Mixed crew outcomes when all starters have ended.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'Undetermined';
