import { useEffect } from 'react';
import { Box, Input } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { isEmptyTaskDesc } from '../taskDescHtml';

interface TaskDescEditorProps {
	value: string;
	onChange: (html: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

function normalizeEditorHtml(html: string): string {
	return isEmptyTaskDesc(html) ? '' : html;
}

/** TipTap editor for task information: BIU, H1–H3, bullet/ordered lists. */
export function TaskDescEditor({
	value,
	onChange,
	placeholder = 'Task information',
	disabled = false,
}: TaskDescEditorProps) {
	const editor = useEditor({
		immediatelyRender: false,
		shouldRerenderOnTransaction: true,
		editable: !disabled,
		extensions: [
			StarterKit.configure({
				link: false,
				heading: { levels: [1, 2, 3] },
			}),
			Placeholder.configure({ placeholder }),
		],
		content: value || '',
		onUpdate: ({ editor: ed }) => {
			onChange(normalizeEditorHtml(ed.getHTML()));
		},
	});

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(!disabled);
	}, [editor, disabled]);

	// Sync external value (e.g. form reset / edit hydrate) without fighting typing.
	useEffect(() => {
		if (!editor) return;
		const next = value || '';
		const current = normalizeEditorHtml(editor.getHTML());
		if (next === current) return;
		if (isEmptyTaskDesc(next) && isEmptyTaskDesc(current)) return;
		editor.commands.setContent(next, { emitUpdate: false });
	}, [editor, value]);

	const hasValue = !isEmptyTaskDesc(value);

	return (
		<Box className='task-desc-editor'>
			<RichTextEditor
				editor={editor}
				variant='subtle'
				style={{
					opacity: disabled ? 0.6 : 1,
					pointerEvents: disabled ? 'none' : undefined,
				}}
			>
				<RichTextEditor.Toolbar sticky stickyOffset={0}>
					<RichTextEditor.ControlsGroup>
						<RichTextEditor.Bold />
						<RichTextEditor.Italic />
						<RichTextEditor.Underline />
						<RichTextEditor.ClearFormatting />
					</RichTextEditor.ControlsGroup>

					<RichTextEditor.ControlsGroup>
						<RichTextEditor.H1 />
						<RichTextEditor.H2 />
						<RichTextEditor.H3 />
					</RichTextEditor.ControlsGroup>

					<RichTextEditor.ControlsGroup>
						<RichTextEditor.BulletList />
						<RichTextEditor.OrderedList />
					</RichTextEditor.ControlsGroup>

					{hasValue && !disabled ? (
						<Box ml='auto' style={{ display: 'flex', alignItems: 'center' }}>
							<Input.ClearButton
								aria-label='Clear task information'
								onClick={() => {
									editor?.commands.clearContent(true);
									onChange('');
								}}
							/>
						</Box>
					) : null}
				</RichTextEditor.Toolbar>

				<RichTextEditor.Content mih={72} />
			</RichTextEditor>
		</Box>
	);
}
