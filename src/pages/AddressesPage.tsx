import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Loader, Title, Box } from '@mantine/core';
import { Plus } from 'lucide-react';
import type {
	ColDef,
	RowClickedEvent,
	ValueFormatterParams,
} from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import {
	createAddress,
	deleteAddress,
	listAddresses,
	updateAddress,
	type Address,
} from '../api/addresses';
import {
	NewAddressModal,
	type NewAddressFormValues,
} from '../components/NewAddressModal';
import { AddressDetailModal } from '../components/AddressDetailModal';

const emptyDash = (p: ValueFormatterParams<Address, string>) =>
	p.value?.trim() ? p.value : '—';

const columnDefs: ColDef<Address>[] = [
	{
		field: 'addressName',
		headerName: 'Name',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1.2,
	},
	{
		field: 'streetLine',
		headerName: 'Street',
		minWidth: 120,
		flex: 1.4,
	},
	{
		field: 'building',
		headerName: 'Building',
		valueFormatter: emptyDash,
		minWidth: 80,
		flex: 0.8,
	},
	{
		field: 'notes',
		headerName: 'Notes',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1.2,
	},
];

export function AddressesPage() {
	const [newAddressOpen, setNewAddressOpen] = useState(false);
	const [editingAddress, setEditingAddress] = useState<Address | null>(null);
	const [detailAddressId, setDetailAddressId] = useState<number | null>(null);
	const [addresses, setAddresses] = useState<Address[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const defaultColDef = useMemo<ColDef<Address>>(
		() => ({
			sortable: true,
			filter: true,
			resizable: true,
		}),
		[],
	);

	const refreshAddresses = useCallback(async (signal?: AbortSignal) => {
		setLoading(true);
		setError(null);
		try {
			const next = await listAddresses(signal);
			if (!signal?.aborted) setAddresses(next);
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Failed to load addresses');
		} finally {
			if (!signal?.aborted) setLoading(false);
		}
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		void refreshAddresses(controller.signal);
		return () => controller.abort();
	}, [refreshAddresses]);

	const handleSaveAddress = async (values: NewAddressFormValues) => {
		const payload = {
			addressName: values.addressName.trim() || undefined,
			streetLine: values.streetLine.trim(),
			building: values.building.trim() || undefined,
			notes: values.notes.trim() || undefined,
		};
		if (editingAddress) {
			await updateAddress(editingAddress.id, payload);
		} else {
			await createAddress(payload);
		}
		await refreshAddresses();
	};

	const handleRowClicked = (event: RowClickedEvent<Address>) => {
		if (event.data?.id != null) {
			setDetailAddressId(event.data.id);
		}
	};

	const handleEditAddress = (address: Address) => {
		setDetailAddressId(null);
		setEditingAddress(address);
	};

	const handleDeleteAddress = async (address: Address) => {
		await deleteAddress(address.id);
		setDetailAddressId(null);
		await refreshAddresses();
	};

	const handleCloseEditor = () => {
		setNewAddressOpen(false);
		setEditingAddress(null);
	};

	const editorInitialValues = useMemo<NewAddressFormValues | null>(
		() =>
			editingAddress
				? {
						addressName: editingAddress.addressName,
						streetLine: editingAddress.streetLine,
						building: editingAddress.building,
						notes: editingAddress.notes,
					}
				: null,
		[editingAddress],
	);

	return (
		<Box className='tasks-page'>
			<Group justify='space-between' mb='md' wrap='nowrap'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					Addresses
				</Title>
				<Button
					leftSection={<Plus size={18} />}
					onClick={() => {
						setEditingAddress(null);
						setNewAddressOpen(true);
					}}
					color='brand'
				>
					New Address
				</Button>
			</Group>

			{error ? (
				<Alert color='red' title='Could not load addresses' mb='md'>
					{error}
				</Alert>
			) : null}

			<Box className='tasks-grid-wrap ag-theme-quartz'>
				{loading && addresses.length === 0 ? (
					<Group justify='center' py='xl'>
						<Loader size='sm' />
					</Group>
				) : (
					<AgGridProvider modules={[AllCommunityModule]}>
						<AgGridReact<Address>
							rowData={addresses}
							columnDefs={columnDefs}
							defaultColDef={defaultColDef}
							getRowId={(p) => String(p.data.id)}
							animateRows
							suppressCellFocus
							suppressHorizontalScroll
							rowStyle={{ cursor: 'pointer' }}
							onRowClicked={handleRowClicked}
							onGridSizeChanged={(e) => e.api.sizeColumnsToFit()}
							onFirstDataRendered={(e) => e.api.sizeColumnsToFit()}
						/>
					</AgGridProvider>
				)}
			</Box>

			<NewAddressModal
				opened={newAddressOpen || editingAddress != null}
				onClose={handleCloseEditor}
				initialValues={editorInitialValues}
				onSave={handleSaveAddress}
			/>

			<AddressDetailModal
				addressId={detailAddressId}
				opened={detailAddressId != null}
				onClose={() => setDetailAddressId(null)}
				onEdit={handleEditAddress}
				onDelete={handleDeleteAddress}
			/>
		</Box>
	);
}
