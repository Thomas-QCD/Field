-- Task description is optional at create time.

BEGIN;

ALTER TABLE tasks ALTER COLUMN description DROP NOT NULL;

COMMIT;
