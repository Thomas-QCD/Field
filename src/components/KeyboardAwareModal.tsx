import { Modal, type ModalProps, type ModalStylesNames } from '@mantine/core';
import type { CSSProperties } from 'react';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard';

type ModalStyleMap = Partial<Record<ModalStylesNames, CSSProperties>>;

function mergeModalStyles(
	base: ModalProps['styles'],
	extra: ModalStyleMap | undefined,
): ModalProps['styles'] {
	if (!extra) return base;

	if (typeof base === 'function') {
		return (theme, props, u) => {
			const resolved = (base(theme, props, u) ?? {}) as ModalStyleMap;
			return {
				...resolved,
				...extra,
				inner: { ...resolved.inner, ...extra.inner },
				content: { ...resolved.content, ...extra.content },
				body: { ...resolved.body, ...extra.body },
				header: { ...resolved.header, ...extra.header },
			};
		};
	}

	const resolved = (base ?? {}) as ModalStyleMap;
	return {
		...resolved,
		...extra,
		inner: { ...resolved.inner, ...extra.inner },
		content: { ...resolved.content, ...extra.content },
		body: { ...resolved.body, ...extra.body },
		header: { ...resolved.header, ...extra.header },
	};
}

/** Top inset: shell header, device safe area, or Mantine’s default 5dvh. */
const TOP_INSET =
	'max(5dvh, calc(var(--field-shell-header, 0px) + var(--field-modal-gap, 8px)), env(safe-area-inset-top, 0px))';

/** Bottom inset when the soft keyboard is closed. */
const BOTTOM_INSET =
	'max(5dvh, calc(var(--field-shell-footer, 0px) + var(--field-modal-gap, 8px)))';

type KeyboardAwareModalProps = ModalProps & {
	/**
	 * Keep a footer pinned: content does not scroll; put overflow on a
	 * child scroll region instead (see task detail modal).
	 */
	pinFooter?: boolean;
};

/**
 * Mantine Modal capped to the visible app area (above footer /
 * device chrome) and lifted above the soft keyboard on mobile.
 */
export function KeyboardAwareModal({
	centered = true,
	styles,
	opened,
	onClose,
	pinFooter = false,
	...props
}: KeyboardAwareModalProps) {
	const keyboard = useVirtualKeyboard();
	const lift = Boolean(opened && keyboard.isOpen && keyboard.height > 0);
	const bottomInset = lift ? `${keyboard.height + 12}px` : BOTTOM_INSET;

	// Same as the modal close control (not Escape-gated).
	useAndroidBackHandler(() => onClose?.(), Boolean(opened && onClose));

	const layoutStyles: ModalStyleMap = {
		inner: {
			alignItems: lift ? 'flex-start' : undefined,
			paddingTop: TOP_INSET,
			paddingBottom: bottomInset,
		},
		content: {
			maxHeight: `calc(100dvh - (${TOP_INSET}) - (${bottomInset}))`,
			...(pinFooter
				? {
						display: 'flex',
						flexDirection: 'column' as const,
						overflow: 'hidden',
					}
				: { overflowY: 'auto' as const }),
		},
	};

	if (pinFooter) {
		layoutStyles.header = {
			flexShrink: 0,
		};
		layoutStyles.body = {
			flex: 1,
			minHeight: 0,
			display: 'flex',
			flexDirection: 'column',
			overflow: 'hidden',
			paddingBottom: 0,
		};
	}

	return (
		<Modal
			{...props}
			opened={opened}
			onClose={onClose}
			centered={lift ? false : centered}
			styles={mergeModalStyles(styles, layoutStyles)}
		/>
	);
}
