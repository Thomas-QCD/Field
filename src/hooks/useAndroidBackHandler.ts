import { useEffect, useEffectEvent } from 'react';
import { registerAndroidBackHandler } from '../androidBack';

/**
 * While `enabled`, Android system back invokes `handler` (same role as an
 * on-screen Back/Close control). Nested registrations are LIFO.
 */
export function useAndroidBackHandler(handler: () => void, enabled: boolean) {
	const onBack = useEffectEvent(handler);

	useEffect(() => {
		if (!enabled) return;
		return registerAndroidBackHandler(() => onBack());
	}, [enabled]);
}
