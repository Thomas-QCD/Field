export type TaskStatus =
  | 'Created'
  | 'Unassigned'
  | 'Assigned'
  | 'Loaded'
  | 'Arrived'
  | 'Completed'
  | 'Failed';

export type TaskType =
  | 'Delivery'
  | 'Install'
  | 'Removal'
  | 'Site Survey'
  | 'Other';

export interface Task {
  id: number;
  taskType: TaskType;
  status: TaskStatus;
  externalKey: string;
  recipientName: string;
  destinationAddress: string;
  driverName: string | null;
}
