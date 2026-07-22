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
			};
		};
	}

	const resolved = (base ?? {}) as ModalStyleMap;
	return {
		...resolved,
		...extra,
		inner: { ...resolved.inner, ...extra.inner },
		content: { ...resolved.content, ...extra.content },
	};
}

/** Top inset: shell header, device safe area, or Mantine’s default 5dvh. */
const TOP_INSET =
	'max(5dvh, calc(var(--field-shell-header, 0px) + var(--field-modal-gap, 8px)), env(safe-area-inset-top, 0px))';

/** Bottom inset when the soft keyboard is closed. */
const BOTTOM_INSET =
	'max(5dvh, calc(var(--field-shell-footer, 0px) + var(--field-modal-gap, 8px)))';

/**
 * Mantine Modal capped to the visible app area (above footer /
 * device chrome) and lifted above the soft keyboard on mobile.
 */
export function KeyboardAwareModal({
	centered = true,
	styles,
	opened,
	onClose,
	...props
}: ModalProps) {
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
			overflowY: 'auto',
		},
	};

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
