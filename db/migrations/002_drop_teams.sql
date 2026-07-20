-- Remove teams: company-local use; assignment is crew-member only.
-- See docs/database-design.md

BEGIN;

ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_team_id;

DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;

COMMIT;
