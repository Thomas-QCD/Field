import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'field.deliveryMode';

const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function getDeliveryMode(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

export function setDeliveryMode(enabled: boolean): void {
	try {
		if (enabled) localStorage.setItem(STORAGE_KEY, '1');
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* ignore quota / private mode */
	}
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Persistable mobile preference: Delivery nav instead of My Tasks + All Tasks. */
export function useDeliveryMode(): [boolean, (enabled: boolean) => void] {
	const enabled = useSyncExternalStore(subscribe, getDeliveryMode, () => false);
	return [enabled, setDeliveryMode];
}
