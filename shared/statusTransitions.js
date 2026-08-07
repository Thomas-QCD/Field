/**
 * Allowed manual/admin status transitions.
 * Shared by API (server/createTask.mjs) and TaskDetailModal.
 */

/** @type {Record<string, string[]>} */
export const STATUS_TRANSITIONS = {
	Unassigned: ['Assigned'],
	Assigned: ['Loaded', 'In Progress', 'Failed'],
	Loaded: ['In Progress', 'Failed'],
	'In Progress': ['Completed', 'Failed', 'Undetermined'],
	Completed: ['In Progress', 'Failed', 'Undetermined'],
	Failed: ['Completed', 'Undetermined'],
	Undetermined: ['Completed', 'Failed'],
	Cancelled: [],
};

/** Delivery: Loaded is the active-work status (same role as In Progress). */
/** @type {Record<string, string[]>} */
export const DELIVERY_STATUS_TRANSITIONS = {
	Unassigned: ['Assigned'],
	Assigned: ['Loaded', 'Failed'],
	Loaded: ['Completed', 'Failed', 'Undetermined'],
	'In Progress': ['Completed', 'Failed', 'Undetermined'],
	Completed: ['Loaded'],
	Failed: [],
	Undetermined: [],
	Cancelled: [],
};

/**
 * @param {string | undefined} taskType
 * @returns {Record<string, string[]>}
 */
export function statusTransitionsFor(taskType) {
	return taskType === 'Delivery'
		? DELIVERY_STATUS_TRANSITIONS
		: STATUS_TRANSITIONS;
}
