-- Field name: early start applies to all task types, not only Install.
-- Reference Wodely field remains CanInstallEarly.

BEGIN;

ALTER TABLE tasks RENAME COLUMN can_install_early TO can_start_early;

COMMIT;
