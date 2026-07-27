import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
	Alert,
	Box,
	Button,
	Group,
	Loader,
	Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type {
	ColDef,
	ICellRendererParams,
	ValueFormatterParams,
} from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { QrCode, Smartphone } from 'lucide-react';
import { listUsers, type AppUser } from '../api/users';
import { IssueActivationQrModal } from '../components/IssueActivationQrModal';
import { ManageMobileDevicesModal } from '../components/ManageMobileDevicesModal';
import { useCurrentUser } from '../context/CurrentUserContext';
import { AG_GRID_MOBILE_MQ, getDefaultColDef } from '../agGridDefaults';

function canManageUsers(role: string | undefined): boolean {
	return role === 'admin' || role === 'creator';
}

function canRevokeMobileSessions(role: string | undefined): boolean {
	return role === 'admin';
}

function ActivationCell({
	data,
	canRevoke,
	onIssue,
	onManageDevices,
}: {
	data: AppUser | undefined;
	canRevoke: boolean;
	onIssue: (user: AppUser) => void;
	onManageDevices: (user: AppUser) => void;
}) {
	if (!data) return null;
	return (
		<Group gap={6} wrap='nowrap'>
			<Button
				size='compact-xs'
				variant='light'
				color='brand'
				leftSection={<QrCode size={14} />}
				onClick={(e) => {
					e.stopPropagation();
					onIssue(data);
				}}
			>
				Issue QR
			</Button>
			{canRevoke ? (
				<Button
					size='compact-xs'
					variant='light'
					color='gray'
					leftSection={<Smartphone size={14} />}
					onClick={(e) => {
						e.stopPropagation();
						onManageDevices(data);
					}}
				>
					Devices
				</Button>
			) : null}
		</Group>
	);
}

export function UsersPage() {
	// Read matchMedia on first paint — Mantine coerces unset to false via `matches || false`,
	// which falsely redirects before the effect runs when getInitialValueInEffect is true.
	const isDesktop = useMediaQuery('(min-width: 48em)', true, {
		getInitialValueInEffect: false,
	});
	const isMobile = useMediaQuery(AG_GRID_MOBILE_MQ);
	const { user: currentUser, loading: userLoading } = useCurrentUser();
	const [users, setUsers] = useState<AppUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [issueUser, setIssueUser] = useState<AppUser | null>(null);
	const [devicesUser, setDevicesUser] = useState<AppUser | null>(null);

	const defaultColDef = useMemo(() => getDefaultColDef(isMobile), [isMobile]);
	const canRevoke = canRevokeMobileSessions(currentUser?.role);

	const refreshUsers = useCallback(async (signal?: AbortSignal) => {
		setLoading(true);
		setError(null);
		try {
			const next = await listUsers(signal);
			if (!signal?.aborted) setUsers(next);
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Failed to load users');
		} finally {
			if (!signal?.aborted) setLoading(false);
		}
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		void refreshUsers(controller.signal);
		return () => controller.abort();
	}, [refreshUsers]);

	const columnDefs = useMemo<ColDef<AppUser>[]>(
		() => [
			{
				field: 'displayName',
				headerName: 'Name',
				minWidth: 140,
				flex: 1.4,
			},
			{
				field: 'role',
				headerName: 'Role',
				minWidth: 100,
				flex: 0.8,
				valueFormatter: (p: ValueFormatterParams<AppUser, string>) =>
					p.value?.trim() ? p.value : '—',
			},
			{
				headerName: 'Activation',
				colId: 'activation',
				minWidth: canRevoke ? 260 : 140,
				flex: 1.4,
				sortable: false,
				filter: false,
				cellRenderer: (params: ICellRendererParams<AppUser>) => (
					<ActivationCell
						data={params.data}
						canRevoke={canRevoke}
						onIssue={(u) => setIssueUser(u)}
						onManageDevices={(u) => setDevicesUser(u)}
					/>
				),
			},
		],
		[canRevoke],
	);

	if (userLoading) {
		return (
			<Group justify='center' py='xl'>
				<Loader size='sm' />
			</Group>
		);
	}

	if (!isDesktop || !canManageUsers(currentUser?.role)) {
		return <Navigate to='/' replace />;
	}

	return (
		<Box className='tasks-page'>
			<Group justify='space-between' mb='md' wrap='nowrap'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					Users
				</Title>
			</Group>

			{error ? (
				<Alert color='red' title='Could not load users' mb='md'>
					{error}
				</Alert>
			) : null}

			<Box className='tasks-grid-wrap ag-theme-quartz'>
				{loading && users.length === 0 ? (
					<Group justify='center' py='xl'>
						<Loader size='sm' />
					</Group>
				) : (
					<AgGridProvider modules={[AllCommunityModule]}>
						<AgGridReact<AppUser>
							rowData={users}
							columnDefs={columnDefs}
							defaultColDef={defaultColDef}
							getRowId={(p) => p.data.id}
							animateRows
							suppressCellFocus
							suppressHorizontalScroll
							onGridSizeChanged={(e) => e.api.sizeColumnsToFit()}
							onFirstDataRendered={(e) => e.api.sizeColumnsToFit()}
						/>
					</AgGridProvider>
				)}
			</Box>

			<IssueActivationQrModal
				user={issueUser}
				opened={issueUser != null}
				onClose={() => setIssueUser(null)}
			/>

			<ManageMobileDevicesModal
				user={devicesUser}
				opened={devicesUser != null}
				onClose={() => setDevicesUser(null)}
			/>
		</Box>
	);
}
