-- Venue / location display name (e.g. Park MGM) so users pick by name, not street.
ALTER TABLE addresses
  ADD COLUMN address_name varchar(255);

CREATE INDEX addresses_address_name_idx ON addresses (address_name);
