-- Unguessable public tracking token per task (customer /t/:token page).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS public_token varchar(43);

-- Backfill: 32 random bytes → base64url (no padding) ≈ 43 chars.
UPDATE tasks
SET public_token = rtrim(
  translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'),
  '='
)
WHERE public_token IS NULL;

ALTER TABLE tasks
  ALTER COLUMN public_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_public_token_uidx
  ON tasks (public_token);

COMMIT;
