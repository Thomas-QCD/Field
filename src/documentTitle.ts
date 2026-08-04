import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const APP_NAME = 'Field';

const EXACT_TITLES: Record<string, string> = {
	'/': APP_NAME,
	'/tasks': 'All Tasks',
	'/my-tasks': 'My Tasks',
	'/delivery': 'Delivery',
	'/contacts': 'Contacts',
	'/addresses': 'Addresses',
	'/users': 'Users',
	'/crew-map': 'Crew Map',
	'/more': 'More',
	'/notifications': 'Notifications',
};

function pageTitleForPath(pathname: string): string {
	const exact = EXACT_TITLES[pathname];
	if (exact) return exact;

	if (/^\/t\/[^/]+\/?$/.test(pathname)) return 'Order tracking';
	if (/^\/task\/[^/]+\/complete\/?$/.test(pathname)) return 'Complete Task';
	if (/^\/task\/[^/]+\/deliver\/?$/.test(pathname)) return 'Deliver Task';
	if (/^\/task\/[^/]+\/?$/.test(pathname)) return 'Task';

	return APP_NAME;
}

export function formatDocumentTitle(page?: string | null): string {
	if (!page || page === APP_NAME) return APP_NAME;
	return `${page}`;
}

/** Sets `document.title` from the current route (`Page · Field`). */
export function DocumentTitle() {
	const { pathname } = useLocation();

	useEffect(() => {
		document.title = formatDocumentTitle(pageTitleForPath(pathname));
	}, [pathname]);

	return null;
}

/** Override the document title for a specific screen (e.g. sign-in, task detail). */
export function useDocumentTitle(page: string | null | undefined) {
	useEffect(() => {
		if (page == null) return;
		const previous = document.title;
		document.title = formatDocumentTitle(page);
		return () => {
			document.title = previous;
		};
	}, [page]);
}
