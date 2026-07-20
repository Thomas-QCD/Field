import {
	Outlet,
	NavLink as RouterNavLink,
	useLocation,
} from 'react-router-dom';
import {
	AppShell,
	Burger,
	Group,
	NavLink,
	Text,
	Box,
	Select,
	Loader,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Capacitor } from '@capacitor/core';
import { ClipboardList, Contact, MapPinned, UserRound } from 'lucide-react';
import { useCurrentUser } from '../context/CurrentUserContext';

const navLinkStyles = {
	root: {
		borderRadius: 'var(--mantine-radius-md)',
		color: 'var(--color-text-on-dark-muted)',
	},
	label: { fontWeight: 500 },
} as const;

const isNative = Capacitor.isNativePlatform();
const nativePlatformLabel =
	Capacitor.getPlatform() === 'ios'
		? 'iOS'
		: Capacitor.getPlatform() === 'android'
			? 'Android'
			: Capacitor.getPlatform();

export function FieldAppShell() {
	const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
		useDisclosure();
	const location = useLocation();
	const { user, users, loading, setUserId } = useCurrentUser();

	const userOptions = users.map((u) => ({
		value: u.id,
		label: u.displayName,
	}));

	const headerHeight = isNative ? 88 : 56;

	return (
		<AppShell
			padding='md'
			layout='alt'
			header={{ height: headerHeight }}
			navbar={{
				width: 240,
				breakpoint: 'sm',
				collapsed: { mobile: !mobileOpened },
			}}
			className='field-app-shell'
			styles={{
				navbar: {
					background: 'var(--color-sidebar)',
					borderRight: 'none',
				},
				header: {
					background: 'rgb(245 245 245 / 92%)',
					backdropFilter: 'blur(8px)',
					zIndex: 201,
				},
				main: {
					background: 'transparent',
					minHeight: '100dvh',
				},
			}}
		>
			<AppShell.Header>
				{isNative && (
					<Box
						bg='var(--mantine-color-brand-6)'
						c='white'
						px='md'
						py={6}
						style={{ textAlign: 'center' }}
					>
						<Text fw={600} fz='sm'>
							Hello Field — {nativePlatformLabel}
						</Text>
					</Box>
				)}
				<Group h={56} gap='sm' px='md'>
					<Burger
						opened={mobileOpened}
						onClick={toggleMobile}
						hiddenFrom='sm'
						size='sm'
						color='dark'
						aria-label='Toggle navigation'
					/>
					<Text fw={700} fz='lg' style={{ fontFamily: 'var(--font-display)' }}>
						Field
					</Text>
				</Group>
			</AppShell.Header>

			<AppShell.Navbar p='md'>
				<AppShell.Section mb='md'>
					<Text
						c='gray.1'
						fw={700}
						fz='xl'
						style={{
							fontFamily: 'var(--font-display)',
							letterSpacing: '-0.02em',
						}}
						visibleFrom='sm'
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
						onClick={closeMobile}
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
						onClick={closeMobile}
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
						onClick={closeMobile}
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
				</AppShell.Section>
			</AppShell.Navbar>

			<AppShell.Main>
				<Box>
					<Outlet />
				</Box>
			</AppShell.Main>
		</AppShell>
	);
}
