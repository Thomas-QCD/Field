-- Remove unused Created status: new tasks start as Unassigned.
-- Remap any lingering Created rows. The enum label is left in place
-- (Postgres cannot DROP ENUM values without recreating the type).

UPDATE tasks
SET status = 'Unassigned'
WHERE status = 'Created';
