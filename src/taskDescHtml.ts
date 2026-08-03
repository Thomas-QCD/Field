import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
	'p',
	'br',
	'strong',
	'b',
	'em',
	'i',
	'u',
	'ul',
	'ol',
	'li',
	'h1',
	'h2',
	'h3',
];

/** True when the string looks like HTML markup (vs legacy plain text). */
export function isLikelyHtml(value: string): boolean {
	return /<[a-z][\s\S]*>/i.test(value);
}

/** Sanitize task-description HTML for safe display. */
export function sanitizeTaskDescHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR: [],
	});
}

/**
 * Strip tags / decode entities for compact surfaces (cards, grid, PDF, map).
 * Works for both HTML and legacy plain text.
 */
export function htmlToPlainText(value: string | null | undefined): string {
	if (value == null) return '';
	const raw = value.trim();
	if (!raw) return '';

	if (!isLikelyHtml(raw)) {
		return raw.replace(/\s+/g, ' ').trim();
	}

	const withBreaks = raw
		.replace(/<\s*br\s*\/?\s*>/gi, '\n')
		.replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
		.replace(/<\s*li[^>]*>/gi, '• ');

	const stripped = withBreaks.replace(/<[^>]+>/g, '');
	return decodeBasicEntities(stripped).replace(/\s+/g, ' ').trim();
}

/** Empty string or editor-empty HTML (`<p></p>`, etc.). */
export function isEmptyTaskDesc(value: string | null | undefined): boolean {
	if (value == null) return true;
	const trimmed = value.trim();
	if (!trimmed) return true;
	if (!isLikelyHtml(trimmed)) return false;
	return htmlToPlainText(trimmed).length === 0;
}

function decodeBasicEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) =>
			String.fromCharCode(parseInt(h, 16)),
		);
}
