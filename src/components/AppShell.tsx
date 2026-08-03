import { useEffect } from 'react';
import {
	Outlet,
	NavLink as RouterNavLink,
	useLocation,
	useNavigate,
} from 'react-router-dom';
import { AppShell, NavLink, Text, Box, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
	ClipboardCheck,
	ClipboardList,
	Contact,
	Map,
	MapPinned,
	Menu,
	Truck,
	Users,
} from 'lucide-react';
import { useCurrentUser } from '../context/CurrentUserContext';
import { useDeliveryMode } from '../deliveryMode';
import { EntraSignedIn, showEntraSignedIn } from '../auth/EntraSignedIn';
import { BrandLogo } from './BrandLogo';
import { UserSelect } from './UserSelect';

const navLinkStyles = {
	root: {
		borderRadius: 'var(--mantine-radius-md)',
		color: 'var(--color-text-on-dark-muted)',
	},
	label: { fontWeight: 500 },
} as const;

const bottomNavCrew = [
	{ to: '/my-tasks', end: false, label: 'My Tasks', icon: ClipboardCheck },
	{ to: '/tasks', end: false, label: 'All Tasks', icon: ClipboardList },
	{ to: '/contacts', end: false, label: 'Contacts', icon: Contact },
	{ to: '/more', end: false, label: 'More', icon: Menu },
] as const;

const bottomNavDelivery = [
	{ to: '/delivery', end: false, label: 'Delivery', icon: Truck },
	{ to: '/contacts', end: false, label: 'Contacts', icon: Contact },
	{ to: '/more', end: false, label: 'More', icon: Menu },
] as const;

function isNavActive(pathname: string, to: string, end: boolean) {
	return end
		? pathname === to
		: pathname === to || pathname.startsWith(`${to}/`);
}

function canManageUsers(role: string | undefined): boolean {
	return role === 'admin' || role === 'creator';
}

export function FieldAppShell() {
	const location = useLocation();
	const navigate = useNavigate();
	const { user } = useCurrentUser();
	const isAdmin = user?.role === 'admin';
	const showUsersNav = canManageUsers(user?.role);
	const [deliveryMode] = useDeliveryMode();
	const isMobile = useMediaQuery('(max-width: 47.99em)');
	const bottomNavItems = deliveryMode ? bottomNavDelivery : bottomNavCrew;

	useEffect(() => {
		if (!isMobile) return;
		const path = location.pathname;
		if (deliveryMode && (path === '/my-tasks' || path === '/tasks')) {
			navigate('/delivery', { replace: true });
		} else if (!deliveryMode && path === '/delivery') {
			navigate('/my-tasks', { replace: true });
		}
	}, [isMobile, deliveryMode, location.pathname, navigate]);

	return (
		<AppShell
			padding='md'
			layout='alt'
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
			<AppShell.Navbar p='md' visibleFrom='sm'>
				<AppShell.Section mb='md'>
					<BrandLogo size={40} />
				</AppShell.Section>

				<AppShell.Section grow>
					<NavLink
						component={RouterNavLink}
						to='/my-tasks'
						label='My Tasks'
						leftSection={<ClipboardCheck size={18} />}
						active={location.pathname === '/my-tasks'}
						color='brand'
						styles={navLinkStyles}
						className='field-nav-link'
					/>
					<NavLink
						component={RouterNavLink}
						to='/tasks'
						label='All Tasks'
						leftSection={<ClipboardList size={18} />}
						active={location.pathname === '/tasks'}
						color='brand'
						styles={navLinkStyles}
						className='field-nav-link'
						mt={4}
					/>
					<NavLink
						component={RouterNavLink}
						to='/delivery'
						label='Delivery'
						leftSection={<Truck size={18} />}
						active={location.pathname === '/delivery'}
						color='brand'
						styles={navLinkStyles}
						className='field-nav-link'
						mt={4}
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
					{showUsersNav ? (
						<NavLink
							component={RouterNavLink}
							to='/users'
							label='Users'
							leftSection={<Users size={18} />}
							active={location.pathname === '/users'}
							color='brand'
							styles={navLinkStyles}
							className='field-nav-link'
							mt={4}
						/>
					) : null}
					{isAdmin ? (
						<NavLink
							component={RouterNavLink}
							to='/crew-map'
							label='Crew map'
							leftSection={<Map size={18} />}
							active={location.pathname === '/crew-map'}
							color='brand'
							styles={navLinkStyles}
							className='field-nav-link'
							mt={4}
						/>
					) : null}
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
					{showEntraSignedIn() ? <EntraSignedIn /> : <UserSelect />}
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
