/** Relative time from now, e.g. "in 2 hours" / "3 days ago". */
export function formatTimeAgo(value: string | null): string | null {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;

	const seconds = Math.round((Date.now() - d.getTime()) / 1000);
	const future = seconds < 0;
	const abs = Math.abs(seconds);

	let label: string;
	if (abs < 45) label = 'just now';
	else if (abs < 90) label = '1 minute';
	else if (abs < 45 * 60) label = `${Math.round(abs / 60)} minutes`;
	else if (abs < 90 * 60) label = '1 hour';
	else if (abs < 22 * 60 * 60) label = `${Math.round(abs / 3600)} hours`;
	else if (abs < 36 * 60 * 60) label = '1 day';
	else if (abs < 26 * 24 * 60 * 60) label = `${Math.round(abs / 86400)} days`;
	else if (abs < 46 * 24 * 60 * 60) label = '1 month';
	else if (abs < 320 * 24 * 60 * 60)
		label = `${Math.round(abs / (30 * 86400))} months`;
	else if (abs < 548 * 24 * 60 * 60) label = '1 year';
	else label = `${Math.round(abs / (365 * 86400))} years`;

	if (label === 'just now') return label;
	return future ? `in ${label}` : `${label} ago`;
}

/** Compact relative, e.g. "in 2h" / "45m ago" / "3d ago". */
export function formatCompactTimeAgo(value: string | null): string | null {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;

	const seconds = Math.round((Date.now() - d.getTime()) / 1000);
	const future = seconds < 0;
	const abs = Math.abs(seconds);

	let label: string;
	if (abs < 45) label = 'now';
	else if (abs < 60 * 60) label = `${Math.max(1, Math.round(abs / 60))}m`;
	else if (abs < 24 * 60 * 60) label = `${Math.round(abs / 3600)}h`;
	else if (abs < 30 * 24 * 60 * 60) label = `${Math.round(abs / 86400)}d`;
	else label = `${Math.round(abs / (30 * 86400))}mo`;

	if (label === 'now') return 'now';
	return future ? `in ${label}` : `${label} ago`;
}

/** e.g. "7/21 2pm (in 2h)" or "7/21 2:05pm (in 2h)". */
export function formatShortDateTimeWithAgo(value: string | null): string {
	if (!value) return '—';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';

	let hours = d.getHours();
	const mins = d.getMinutes();
	const suffix = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12;
	if (hours === 0) hours = 12;
	const time =
		mins === 0
			? `${hours}${suffix}`
			: `${hours}:${String(mins).padStart(2, '0')}${suffix}`;
	const absolute = `${d.getMonth() + 1}/${d.getDate()} ${time}`;
	const ago = formatCompactTimeAgo(value);
	return ago ? `${absolute} (${ago})` : absolute;
}
