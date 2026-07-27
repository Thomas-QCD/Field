import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { setAccessTokenProvider } from '../api/client';

const STORAGE_KEY = 'field.mobileDeviceSession';

/** Local durable session after QR activation (SDD MobileDeviceSession). */
export interface MobileDeviceSession {
	deviceSessionToken: string;
	userId: string;
	displayName: string;
	role: string;
	apiBaseUrl: string;
}

type SessionListener = (session: MobileDeviceSession | null) => void;

const listeners = new Set<SessionListener>();

let memorySession: MobileDeviceSession | null = null;
let loaded = false;

function notify() {
	for (const listener of listeners) {
		listener(memorySession);
	}
}

export function subscribeMobileSession(listener: SessionListener): () => void {
	listeners.add(listener);
	listener(memorySession);
	return () => {
		listeners.delete(listener);
	};
}

export function getMobileSession(): MobileDeviceSession | null {
	return memorySession;
}

function wireTokenProvider(session: MobileDeviceSession | null) {
	if (!Capacitor.isNativePlatform()) return;
	if (session?.deviceSessionToken) {
		setAccessTokenProvider(async () => session.deviceSessionToken);
	} else {
		setAccessTokenProvider(null);
	}
}

function parseSession(value: string): MobileDeviceSession | null {
	try {
		const parsed = JSON.parse(value) as MobileDeviceSession;
		if (
			typeof parsed.deviceSessionToken !== 'string' ||
			typeof parsed.userId !== 'string' ||
			typeof parsed.displayName !== 'string'
		) {
			return null;
		}
		return {
			deviceSessionToken: parsed.deviceSessionToken,
			userId: parsed.userId,
			displayName: parsed.displayName,
			role: typeof parsed.role === 'string' ? parsed.role : 'crew',
			apiBaseUrl:
				typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : '',
		};
	} catch {
		return null;
	}
}

async function readStored(): Promise<string | null> {
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		return value;
	} catch {
		// Native plugin missing until APK/IPA rebuild after cap sync — use localStorage.
		return localStorage.getItem(STORAGE_KEY);
	}
}

async function writeStored(value: string): Promise<void> {
	try {
		await Preferences.set({ key: STORAGE_KEY, value });
	} catch {
		localStorage.setItem(STORAGE_KEY, value);
	}
}

async function removeStored(): Promise<void> {
	try {
		await Preferences.remove({ key: STORAGE_KEY });
	} catch {
		localStorage.removeItem(STORAGE_KEY);
	}
	localStorage.removeItem(STORAGE_KEY);
}

export async function loadMobileSession(): Promise<MobileDeviceSession | null> {
	if (!Capacitor.isNativePlatform()) {
		memorySession = null;
		loaded = true;
		wireTokenProvider(null);
		return null;
	}

	const value = await readStored();
	if (!value) {
		memorySession = null;
		loaded = true;
		wireTokenProvider(null);
		notify();
		return null;
	}

	memorySession = parseSession(value);
	if (!memorySession) {
		await removeStored();
	}

	loaded = true;
	wireTokenProvider(memorySession);
	notify();
	return memorySession;
}

export function isMobileSessionLoaded(): boolean {
	return loaded;
}

export async function saveMobileSession(
	session: MobileDeviceSession,
): Promise<void> {
	memorySession = session;
	if (Capacitor.isNativePlatform()) {
		await writeStored(JSON.stringify(session));
	}
	wireTokenProvider(session);
	notify();
}

export async function clearMobileSession(): Promise<void> {
	memorySession = null;
	if (Capacitor.isNativePlatform()) {
		await removeStored();
	}
	wireTokenProvider(null);
	notify();
}
