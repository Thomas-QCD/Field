-- System user for Wodely webhook / reconciler inserts when Tag1 cannot be resolved.

INSERT INTO users (id, display_name, email, phone, role, is_active)
VALUES (
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'Wodely Sync',
  NULL,
  NULL,
  'admin',
  true
)
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  is_active = true,
  updated_at = now();
