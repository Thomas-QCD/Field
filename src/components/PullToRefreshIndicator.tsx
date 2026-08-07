import { Loader } from '@mantine/core';
import { RefreshCw } from 'lucide-react';
import { FIELD_PTR_THRESHOLD } from '../hooks/useFieldPullToRefresh';

type Props = {
	pullPosition: number;
	isRefreshing: boolean;
};

/**
 * Overlay spinner for pull-to-refresh. Sits above content (content does not
 * translate) so it works with sticky headers like `.task-view-header`.
 */
export function PullToRefreshIndicator({
	pullPosition,
	isRefreshing,
}: Props) {
	const visible = isRefreshing || pullPosition > 0;
	const progress = Math.min(pullPosition / FIELD_PTR_THRESHOLD, 1);
	const offset = isRefreshing
		? FIELD_PTR_THRESHOLD * 0.55
		: pullPosition * 0.55;

	return (
		<div
			className='field-ptr-indicator'
			aria-hidden={!visible}
			data-refreshing={isRefreshing || undefined}
			style={{
				opacity: visible ? 1 : 0,
				transform: `translate(-50%, ${offset}px)`,
			}}
		>
			{isRefreshing ? (
				<Loader size='sm' color='brand' />
			) : (
				<RefreshCw
					size={20}
					strokeWidth={2.25}
					aria-hidden
					style={{ transform: `rotate(${progress * 180}deg)` }}
				/>
			)}
		</div>
	);
}
