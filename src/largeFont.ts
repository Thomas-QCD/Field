import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'field.largeFont';
const CLASS_NAME = 'field-large-font';

const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function applyClass(enabled: boolean): void {
	if (typeof document === 'undefined') return;
	document.documentElement.classList.toggle(CLASS_NAME, enabled);
}

export function getLargeFont(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

export function setLargeFont(enabled: boolean): void {
	try {
		if (enabled) localStorage.setItem(STORAGE_KEY, '1');
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* ignore quota / private mode */
	}
	applyClass(enabled);
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Apply stored preference before first paint when this module loads. */
applyClass(getLargeFont());

/** Persistable preference: global base font size floored at 20px. */
export function useLargeFont(): [boolean, (enabled: boolean) => void] {
	const enabled = useSyncExternalStore(subscribe, getLargeFont, () => false);
	return [enabled, setLargeFont];
}
