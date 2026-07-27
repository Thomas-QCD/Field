-- Rename Arrived → In Progress (crew on site / working).

ALTER TYPE task_status RENAME VALUE 'Arrived' TO 'In Progress';
