-- Add Pickup task type (Wodely TypeDesc parity).

ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'Pickup';
