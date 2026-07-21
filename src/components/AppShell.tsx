import {
	Outlet,
	NavLink as RouterNavLink,
	useLocation,
} from 'react-router-dom';
import {
	AppShell,
	Group,
	NavLink,
	Text,
	Box,
	Select,
	Loader,
	UnstyledButton,
} from '@mantine/core';
import { ClipboardList, Contact, MapPinned, UserRound } from 'lucide-react';
import { useCurrentUser } from '../context/CurrentUserContext';

const navLinkStyles = {
	root: {
		borderRadius: 'var(--mantine-radius-md)',
		color: 'var(--color-text-on-dark-muted)',
	},
	label: { fontWeight: 500 },
} as const;

const bottomNavItems = [
	{ to: '/', end: true, label: 'Tasks', icon: ClipboardList },
	{ to: '/contacts', end: false, label: 'Contacts', icon: Contact },
	{ to: '/addresses', end: false, label: 'Addresses', icon: MapPinned },
] as const;

function isNavActive(pathname: string, to: string, end: boolean) {
	return end
		? pathname === to
		: pathname === to || pathname.startsWith(`${to}/`);
}

function UserSelect() {
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
				input: 'field-user-select-input',
				dropdown: 'field-user-select-dropdown',
				option: 'field-user-select-option',
			}}
			aria-label='Current user'
		/>
	);
}

export function FieldAppShell() {
	const location = useLocation();

	return (
		<AppShell
			padding='md'
			layout='alt'
			header={{ height: 56 }}
			footer={{ height: 64 }}
			navbar={{
				width: 240,
				breakpoint: 'sm',
				collapsed: { mobile: true },
			}}
			className='field-app-shell'
			styles={{
				navbar: {
					background: 'var(--color-sidebar)',
					borderRight: 'none',
					zIndex: 202,
				},
				header: {
					background: 'rgb(245 245 245 / 92%)',
					backdropFilter: 'blur(8px)',
					zIndex: 201,
				},
				footer: {
					background: 'var(--color-sidebar)',
					borderTop: 'none',
					zIndex: 201,
				},
				main: {
					background: 'transparent',
				},
			}}
		>
			<AppShell.Header>
				<Group h={56} gap='sm' px='md' justify='space-between' wrap='nowrap'>
					<Text fw={700} fz='lg' style={{ fontFamily: 'var(--font-display)' }}>
						Field
					</Text>
					<Box hiddenFrom='sm' maw='58%' className='field-header-user-select'>
						<UserSelect />
					</Box>
				</Group>
			</AppShell.Header>

			<AppShell.Navbar p='md' visibleFrom='sm'>
				<AppShell.Section mb='md'>
					<Text
						c='gray.1'
						fw={700}
						fz='xl'
						style={{
							fontFamily: 'var(--font-display)',
							letterSpacing: '-0.02em',
						}}
					>
						Field
					</Text>
				</AppShell.Section>

				<AppShell.Section grow>
					<NavLink
						component={RouterNavLink}
						to='/'
						end
						label='Tasks'
						leftSection={<ClipboardList size={18} />}
						active={location.pathname === '/'}
						color='brand'
						styles={navLinkStyles}
						className='field-nav-link'
					/>
					<NavLink
						component={RouterNavLink}
						to='/contacts'
						label='Contacts'
						leftSection={<Contact size={18} />}
						active={location.pathname === '/contacts'}
						color='brand'
						styles={navLinkStyles}
						className='field-nav-link'
						mt={4}
					/>
					<NavLink
						component={RouterNavLink}
						to='/addresses'
						label='Addresses'
						leftSection={<MapPinned size={18} />}
						active={location.pathname === '/addresses'}
						color='brand'
						styles={navLinkStyles}
						className='field-nav-link'
						mt={4}
					/>
				</AppShell.Section>

				<AppShell.Section mt='md'>
					<Text
						fz={11}
						tt='uppercase'
						fw={600}
						c='var(--color-text-on-dark-muted)'
						mb={6}
						style={{ letterSpacing: '0.04em' }}
					>
						Signed in as
					</Text>
					<UserSelect />
				</AppShell.Section>
			</AppShell.Navbar>

			<AppShell.Footer hiddenFrom='sm' className='field-bottom-nav'>
				<nav className='field-bottom-nav-inner' aria-label='Main'>
					{bottomNavItems.map(({ to, end, label, icon: Icon }) => {
						const active = isNavActive(location.pathname, to, end);
						return (
							<UnstyledButton
								key={to}
								component={RouterNavLink}
								to={to}
								end={end}
								className='field-bottom-nav-item'
								data-active={active || undefined}
								aria-current={active ? 'page' : undefined}
							>
								<Icon size={22} strokeWidth={active ? 2.25 : 2} aria-hidden />
								<span>{label}</span>
							</UnstyledButton>
						);
					})}
				</nav>
			</AppShell.Footer>

			<AppShell.Main>
				<Box className='field-main-content'>
					<Outlet />
				</Box>
			</AppShell.Main>
		</AppShell>
	);
}
