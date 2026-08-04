export const EQUIPMENT_OPTIONS: readonly string[];
export const EQUIPMENT_OPTION_SET: ReadonlySet<string>;
export const EQUIPMENT_TASK_TYPES: ReadonlySet<string>;

export function taskTypeUsesEquipment(taskType: string): boolean;

export function parseEquipment(raw: unknown, taskType: string): string[];
