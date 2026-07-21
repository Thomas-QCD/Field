import { useEffect, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

export type VirtualKeyboardState = {
	isOpen: boolean;
	height: number;
};

const CLOSED: VirtualKeyboardState = { isOpen: false, height: 0 };

let state: VirtualKeyboardState = CLOSED;
const listeners = new Set<() => void>();
let started = false;

function emit() {
	for (const listener of listeners) listener();
}

function setState(next: VirtualKeyboardState) {
	if (state.isOpen === next.isOpen && state.height === next.height) return;
	state = next;
	emit();
}

/** Ignore small chrome/toolbar shrinks when using visualViewport. */
const VIEWPORT_KEYBOARD_THRESHOLD_PX = 120;

function startVisualViewportFallback() {
	const vv = window.visualViewport;
	if (!vv) return;

	const update = () => {
		const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
		const open = inset > VIEWPORT_KEYBOARD_THRESHOLD_PX;
		setState({ isOpen: open, height: open ? inset : 0 });
	};

	vv.addEventListener('resize', update);
	vv.addEventListener('scroll', update);
}

async function startNativeListeners() {
	await Keyboard.setResizeMode({ mode: KeyboardResize.None }).catch(() => {
		/* Android may not support setResizeMode; config handles iOS. */
	});

	await Keyboard.addListener('keyboardWillShow', (info) => {
		setState({ isOpen: true, height: info.keyboardHeight });
	});
	await Keyboard.addListener('keyboardDidShow', (info) => {
		setState({ isOpen: true, height: info.keyboardHeight });
	});
	await Keyboard.addListener('keyboardWillHide', () => {
		setState(CLOSED);
	});
	await Keyboard.addListener('keyboardDidHide', () => {
		setState(CLOSED);
	});
}

function ensureStarted() {
	if (started || typeof window === 'undefined') return;
	started = true;

	if (Capacitor.isNativePlatform()) {
		void startNativeListeners();
	} else {
		startVisualViewportFallback();
	}
}

/**
 * Tracks soft-keyboard open state and height.
 * Native: @capacitor/keyboard. Web: visualViewport inset heuristic.
 */
export function useVirtualKeyboard(): VirtualKeyboardState {
	useEffect(() => {
		ensureStarted();
	}, []);

	return useSyncExternalStore(
		(onStoreChange) => {
			listeners.add(onStoreChange);
			return () => {
				listeners.delete(onStoreChange);
			};
		},
		() => state,
		() => CLOSED,
	);
}
