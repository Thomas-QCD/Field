-- Field operates from one fixed location; no per-task pickup/dispatch address.
-- Reference Dispatch* fields are out of scope.

BEGIN;

ALTER TABLE tasks DROP COLUMN IF EXISTS dispatch_address_id;

COMMIT;
