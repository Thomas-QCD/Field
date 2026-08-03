/** "Omar Ortiz" → "Omar O."; single token left as-is. */
export function formatShortName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return trimmed;
	const space = trimmed.indexOf(' ');
	if (space < 0) return trimmed;
	const first = trimmed.slice(0, space);
	const rest = trimmed.slice(space + 1).trimStart();
	const initial = rest.charAt(0);
	if (!initial) return first;
	return `${first} ${initial.toUpperCase()}.`;
}

/** Format each name in a comma-separated list (e.g. API crew aggregates). */
export function formatShortNameList(names: string): string {
	return names
		.split(',')
		.map((part) => formatShortName(part.trim()))
		.filter(Boolean)
		.join(', ');
}
