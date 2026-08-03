export declare const STATUS_TRANSITIONS: Record<string, string[]>;
export declare const DELIVERY_STATUS_TRANSITIONS: Record<string, string[]>;
export declare function statusTransitionsFor(
	taskType: string | undefined,
): Record<string, string[]>;
