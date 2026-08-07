import { useCallback, useRef, useState } from 'react';
import { usePullToRefresh } from 'use-pull-to-refresh';

/** Pull distance that triggers refresh (library default 180 is too tall). */
export const FIELD_PTR_THRESHOLD = 64;
/** Cap on pull travel with resistance enabled. */
export const FIELD_PTR_MAX_PULL = 120;

/**
 * Field adapter around `use-pull-to-refresh` for AppShell inner scrollers.
 *
 * The library falls back to `window` when `elementRef.current` is null — wrong
 * for our overflow:hidden shell. Keep disabled until a real scroll element is
 * bound (callback ref or `setScrollElement` for AG Grid's late viewport).
 */
export function useFieldPullToRefresh({
	enabled,
	onRefresh,
}: {
	enabled: boolean;
	onRefresh: () => void | Promise<void>;
}): {
	scrollRef: (node: HTMLDivElement | null) => void;
	setScrollElement: (el: HTMLElement | null) => void;
	pullPosition: number;
	isRefreshing: boolean;
} {
	const scrollNodeRef = useRef<HTMLDivElement | null>(null);
	const overrideRef = useRef<HTMLElement | null>(null);
	const [boundElement, setBoundElement] = useState<HTMLElement | null>(null);

	const elementRef = useRef<HTMLElement | null>(null);
	elementRef.current = overrideRef.current ?? scrollNodeRef.current;

	const syncBound = useCallback(() => {
		setBoundElement(overrideRef.current ?? scrollNodeRef.current);
	}, []);

	const scrollRef = useCallback(
		(node: HTMLDivElement | null) => {
			scrollNodeRef.current = node;
			if (!overrideRef.current) syncBound();
		},
		[syncBound],
	);

	const setScrollElement = useCallback(
		(el: HTMLElement | null) => {
			overrideRef.current = el;
			syncBound();
		},
		[syncBound],
	);

	const hasElement = boundElement != null;

	const { isRefreshing, pullPosition } = usePullToRefresh({
		onRefresh,
		isDisabled: !enabled || !hasElement,
		elementRef,
		refreshThreshold: FIELD_PTR_THRESHOLD,
		maximumPullLength: FIELD_PTR_MAX_PULL,
		enableResistance: true,
	});

	return {
		scrollRef,
		setScrollElement,
		pullPosition,
		isRefreshing,
	};
}
