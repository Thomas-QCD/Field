import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';
import { listUsers, type AppUser } from '../api/users';

const STORAGE_KEY = 'field.currentUserId';

interface CurrentUserContextValue {
	user: AppUser | null;
	users: AppUser[];
	loading: boolean;
	setUserId: (id: string | null) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
	const [users, setUsers] = useState<AppUser[]>([]);
	const [userId, setUserIdState] = useState<string | null>(() =>
		localStorage.getItem(STORAGE_KEY),
	);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);

		listUsers(controller.signal)
			.then((list) => {
				setUsers(list);
				setUserIdState((prev) => {
					if (prev && list.some((u) => u.id === prev)) return prev;
					const next = list[0]?.id ?? null;
					if (next) localStorage.setItem(STORAGE_KEY, next);
					else localStorage.removeItem(STORAGE_KEY);
					return next;
				});
			})
			.catch((err: unknown) => {
				if (
					(err instanceof DOMException || err instanceof Error) &&
					err.name === 'AbortError'
				) {
					return;
				}
				console.error(err);
				setUsers([]);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, []);

	const setUserId = (id: string | null) => {
		setUserIdState(id);
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
	};

	const user = users.find((u) => u.id === userId) ?? null;

	return (
		<CurrentUserContext.Provider value={{ user, users, loading, setUserId }}>
			{children}
		</CurrentUserContext.Provider>
	);
}

export function useCurrentUser(): CurrentUserContextValue {
	const ctx = useContext(CurrentUserContext);
	if (!ctx) {
		throw new Error('useCurrentUser must be used within CurrentUserProvider');
	}
	return ctx;
}
