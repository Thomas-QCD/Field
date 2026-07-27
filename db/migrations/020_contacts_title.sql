-- Optional role/relationship label for a contact (e.g. "Electrical manager").
-- No backfill — existing rows remain NULL.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS title varchar(255);
