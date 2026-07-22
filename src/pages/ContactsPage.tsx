import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Loader, Title, Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus } from 'lucide-react';
import type {
	ColDef,
	RowClickedEvent,
	ValueFormatterParams,
} from 'ag-grid-community';
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import {
	createContact,
	deleteContact,
	listContacts,
	updateContact,
	type Contact,
} from '../api/contacts';
import {
	NewContactModal,
	type NewContactFormValues,
} from '../components/NewContactModal';
import { ContactDetailModal } from '../components/ContactDetailModal';

const emptyDash = (p: ValueFormatterParams<Contact, string>) =>
	p.value?.trim() ? p.value : '—';

const columnDefs: ColDef<Contact>[] = [
	{
		field: 'name',
		headerName: 'Contact',
		minWidth: 100,
		flex: 1.2,
	},
	{
		field: 'phone',
		headerName: 'Phone',
		valueFormatter: emptyDash,
		minWidth: 88,
		flex: 0.8,
	},
	{
		field: 'email',
		headerName: 'Email',
		valueFormatter: emptyDash,
		minWidth: 100,
		flex: 1.2,
	},
];

export function ContactsPage() {
	const isMobile = useMediaQuery('(max-width: 47.9975em)');
	const [newContactOpen, setNewContactOpen] = useState(false);
	const [editingContact, setEditingContact] = useState<Contact | null>(null);
	const [detailContactId, setDetailContactId] = useState<number | null>(null);
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const defaultColDef = useMemo<ColDef<Contact>>(
		() => ({
			sortable: true,
			filter: true,
			resizable: true,
		}),
		[],
	);

	const refreshContacts = useCallback(async (signal?: AbortSignal) => {
		setLoading(true);
		setError(null);
		try {
			const next = await listContacts(signal);
			if (!signal?.aborted) setContacts(next);
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			setError(err instanceof Error ? err.message : 'Failed to load contacts');
		} finally {
			if (!signal?.aborted) setLoading(false);
		}
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		void refreshContacts(controller.signal);
		return () => controller.abort();
	}, [refreshContacts]);

	const handleSaveContact = async (values: NewContactFormValues) => {
		const payload = {
			name: values.name.trim(),
			phone: values.phone.trim() || undefined,
			email: values.email.trim() || undefined,
		};
		if (editingContact) {
			await updateContact(editingContact.id, payload);
		} else {
			await createContact(payload);
		}
		await refreshContacts();
	};

	const handleRowClicked = (event: RowClickedEvent<Contact>) => {
		if (event.data?.id != null) {
			setDetailContactId(event.data.id);
		}
	};

	const handleEditContact = (contact: Contact) => {
		setDetailContactId(null);
		setEditingContact(contact);
	};

	const handleDeleteContact = async (contact: Contact) => {
		await deleteContact(contact.id);
		setDetailContactId(null);
		await refreshContacts();
	};

	const handleCloseEditor = () => {
		setNewContactOpen(false);
		setEditingContact(null);
	};

	const editorInitialValues = useMemo<NewContactFormValues | null>(
		() =>
			editingContact
				? {
						name: editingContact.name,
						phone: editingContact.phone,
						email: editingContact.email,
					}
				: null,
		[editingContact],
	);

	return (
		<Box className='tasks-page'>
			<Group justify='space-between' mb='md' wrap='nowrap'>
				<Title order={1} fz={{ base: 'h3', sm: 'h2' }}>
					Contacts
				</Title>
				<Button
					leftSection={<Plus size={18} />}
					onClick={() => {
						setEditingContact(null);
						setNewContactOpen(true);
					}}
					color='brand'
				>
					New Contact
				</Button>
			</Group>

			{error ? (
				<Alert color='red' title='Could not load contacts' mb='md'>
					{error}
				</Alert>
			) : null}

			<Box className='tasks-grid-wrap ag-theme-quartz'>
				{loading && contacts.length === 0 ? (
					<Group justify='center' py='xl'>
						<Loader size='sm' />
					</Group>
				) : (
					<AgGridProvider modules={[AllCommunityModule]}>
						<AgGridReact<Contact>
							rowData={contacts}
							columnDefs={columnDefs}
							defaultColDef={defaultColDef}
							getRowId={(p) => String(p.data.id)}
							rowHeight={isMobile ? 40 : undefined}
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

			<NewContactModal
				opened={newContactOpen || editingContact != null}
				onClose={handleCloseEditor}
				initialValues={editorInitialValues}
				onSave={handleSaveContact}
			/>

			<ContactDetailModal
				contactId={detailContactId}
				opened={detailContactId != null}
				onClose={() => setDetailContactId(null)}
				onEdit={handleEditContact}
				onDelete={handleDeleteContact}
			/>
		</Box>
	);
}
