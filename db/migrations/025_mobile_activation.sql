-- Mobile QR activation: one-time codes + durable device sessions.

BEGIN;

CREATE TABLE mobile_activation_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id),
  code_hash varchar(255) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX mobile_activation_codes_user_id_idx
  ON mobile_activation_codes (user_id);

CREATE TABLE mobile_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id),
  token_hash varchar(255) NOT NULL UNIQUE,
  device_label varchar(255),
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users (id),
  activation_code_id uuid REFERENCES mobile_activation_codes (id)
);

CREATE INDEX mobile_devices_user_id_idx ON mobile_devices (user_id);

COMMIT;
