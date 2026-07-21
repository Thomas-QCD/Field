import { Modal, type ModalProps, type ModalStylesNames } from '@mantine/core';
import type { CSSProperties } from 'react';
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

/**
 * Mantine Modal that lifts above the soft keyboard on mobile.
 * When the keyboard opens, centering is disabled and the dialog is pinned
 * to the visible viewport above the keyboard.
 */
export function KeyboardAwareModal({
	centered = true,
	styles,
	opened,
	...props
}: ModalProps) {
	const keyboard = useVirtualKeyboard();
	const lift = Boolean(opened && keyboard.isOpen && keyboard.height > 0);

	const keyboardStyles: ModalStyleMap | undefined = lift
		? {
				inner: {
					alignItems: 'flex-start',
					paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
					paddingBottom: keyboard.height + 12,
				},
				content: {
					maxHeight: `calc(100dvh - ${keyboard.height}px - 24px - env(safe-area-inset-top, 0px))`,
					overflowY: 'auto',
				},
			}
		: undefined;

	return (
		<Modal
			{...props}
			opened={opened}
			centered={lift ? false : centered}
			styles={mergeModalStyles(styles, keyboardStyles)}
		/>
	);
}
