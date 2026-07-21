import { Select, Loader } from '@mantine/core';
import { UserRound } from 'lucide-react';
import { useCurrentUser } from '../context/CurrentUserContext';

type UserSelectProps = {
	/** Light surface (page content) vs dark (sidebar). */
	variant?: 'dark' | 'light';
};

export function UserSelect({ variant = 'dark' }: UserSelectProps) {
	const { user, users, loading, setUserId } = useCurrentUser();

	const userOptions = users.map((u) => ({
		value: u.id,
		label: u.displayName,
	}));

	return (
		<Select
			size='sm'
			data={userOptions}
			value={user?.id ?? null}
			onChange={(id) => setUserId(id)}
			placeholder={loading ? 'Loading…' : 'Select user'}
			searchable
			leftSection={
				loading ? <Loader size={14} color='gray' /> : <UserRound size={16} />
			}
			nothingFoundMessage='No users'
			comboboxProps={{ withinPortal: true, shadow: 'md' }}
			classNames={{
				input:
					variant === 'light'
						? 'field-user-select-input field-user-select-input--light'
						: 'field-user-select-input',
				dropdown: 'field-user-select-dropdown',
				option: 'field-user-select-option',
			}}
			aria-label='Current user'
		/>
	);
}
