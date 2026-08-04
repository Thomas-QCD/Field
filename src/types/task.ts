export type TaskStatus =
  | 'Unassigned'
  | 'Assigned'
  | 'Loaded'
  | 'In Progress'
  | 'Completed'
  | 'Failed'
  | 'Undetermined'
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
  jobTitle: string;
  contactNames: string;
  destinationAddressName: string;
  destinationStreet: string;
  destinationBuilding: string;
  destinationAddress: string;
  crewName: string | null;
  windowStartAt: string | null;
  windowEndAt: string | null;
  description: string;
  createdByName: string;
  cancelledAt: string | null;
  publicToken?: string;
  publicTrackingPath?: string;
  publicTrackingUrl?: string;
}

export interface TaskCrewMember {
  id: string;
  displayName: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface TaskContact {
  id: number;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPoc: boolean;
}

export type AttachmentKind = 'photo' | 'signature' | 'document' | 'video';

export interface TaskAttachment {
  id: number;
  taskId: number;
  kind: AttachmentKind;
  storageKey: string;
  mimeType: string;
  fileName: string | null;
  fileSizeBytes: number | null;
  caption: string | null;
  createdAt: string;
  uploadedByUserId: string;
  uploadedByName: string | null;
}

export interface TaskCompletionNote {
  userId: string;
  displayName: string;
  outcome: 'Completed' | 'Failed';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail {
  id: number;
  taskType: TaskType;
  status: TaskStatus;
  description: string;
  jobTitle: string;
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
  isUrgent: boolean;
  equipment: string[];
  windowStartAt: string | null;
  windowEndAt: string | null;
  completedNotes: string | null;
  completedAt: string | null;
  failedReason: string | null;
  cancelledAt: string | null;
  publicToken?: string;
  publicTrackingPath?: string;
  publicTrackingUrl?: string;
  completionNotes: TaskCompletionNote[];
  completionNotesByName: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
  crewMembers: TaskCrewMember[];
  attachments?: TaskAttachment[];
}
