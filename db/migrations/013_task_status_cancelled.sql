-- Add Cancelled status (Wodely webhook task-cancelled / stateHistory).

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'Cancelled';
