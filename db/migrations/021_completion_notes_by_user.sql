-- Who last wrote completed_notes / failed_reason (crew end or admin status change).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completion_notes_by_user_id uuid REFERENCES users (id);

CREATE INDEX IF NOT EXISTS tasks_completion_notes_by_user_idx
  ON tasks (completion_notes_by_user_id)
  WHERE completion_notes_by_user_id IS NOT NULL;
