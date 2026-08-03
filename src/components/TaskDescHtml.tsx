import { isLikelyHtml, sanitizeTaskDescHtml } from '../taskDescHtml';

interface TaskDescHtmlProps {
	value: string;
	className?: string;
}

/** Renders task description: sanitized HTML when markup is present, else plain pre-wrap. */
export function TaskDescHtml({ value, className }: TaskDescHtmlProps) {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const classes = ['task-desc-html', className].filter(Boolean).join(' ');

	if (isLikelyHtml(trimmed)) {
		return (
			<div
				className={classes}
				dangerouslySetInnerHTML={{
					__html: sanitizeTaskDescHtml(trimmed),
				}}
			/>
		);
	}

	return (
		<div className={classes} style={{ whiteSpace: 'pre-wrap' }}>
			{trimmed}
		</div>
	);
}
