export type TaskStatus =
  | 'Created'
  | 'Unassigned'
  | 'Assigned'
  | 'Loaded'
  | 'Arrived'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export type TaskType =
  | 'Delivery'
  | 'Install'
  | 'Removal'
  | 'Site Survey'
  | 'Pickup'
  | 'Other';

export interface Task {
  id: number;
  taskType: TaskType;
  status: TaskStatus;
  externalKey: string;
  contactNames: string;
  destinationAddress: string;
  crewName: string | null;
}

export interface TaskCrewMember {
  id: string;
  displayName: string;
}

export interface TaskContact {
  id: number;
  name: string;
  phone: string;
  email: string;
}

export interface TaskDetail {
  id: number;
  taskType: TaskType;
  status: TaskStatus;
  description: string;
  externalKey: string;
  destinationAddressId: number | null;
  destinationAddressName: string;
  destinationAddress: string;
  destinationBuilding: string;
  destinationNotes: string;
  contacts: TaskContact[];
  crewSize: number | null;
  estimatedHours: number | null;
  isTimeSpecific: boolean;
  canStartEarly: boolean;
  windowStartAt: string | null;
  windowEndAt: string | null;
  completedNotes: string | null;
  completedAt: string | null;
  failedReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  crewMembers: TaskCrewMember[];
}
