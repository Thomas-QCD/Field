import { useEffect, useState } from 'react';
import {
	Stack,
	Group,
	Text,
	SimpleGrid,
	Loader,
	Alert,
	Button,
	Box,
} from '@mantine/core';
import { Pencil, Trash2 } from 'lucide-react';
import { getContact, type Contact } from '../api/contacts';
import { KeyboardAwareModal } from './KeyboardAwareModal';

interface ContactDetailModalProps {
	contactId: number | null;
	opened: boolean;
	onClose: () => void;
	onEdit?: (contact: Contact) => void;
	onDelete?: (contact: Contact) => Promise<void>;
}

function DetailField({
	label,
	value,
	span = 1,
}: {
	label: string;
	value: string;
	span?: number;
}) {
	return (
		<Box style={{ gridColumn: span > 1 ? `span ${span}` : undefined }}>
			<Text fz={11} c='dimmed' fw={600} tt='uppercase' mb={2}>
				{label}
			</Text>
			<Text fz={14} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
				{value || '—'}
			</Text>
		</Box>
	);
}

export function ContactDetailModal({
	contactId,
	opened,
	onClose,
	onEdit,
	onDelete,
}: ContactDetailModalProps) {
	const [contact, setContact] = useState<Contact | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	useEffect(() => {
		if (!opened || contactId == null) {
			setContact(null);
			setError(null);
			setLoading(false);
			setDeleting(false);
			setDeleteError(null);
			return;
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setDeleteError(null);
		setContact(null);

		getContact(contactId, controller.signal)
			.then((next) => {
				if (!controller.signal.aborted) setContact(next);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load contact');
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [opened, contactId]);

	const handleDelete = async () => {
		if (!contact || !onDelete) return;
		if (!window.confirm(`Delete contact “${contact.name}”?`)) return;
		setDeleting(true);
		setDeleteError(null);
		try {
			await onDelete(contact);
		} catch (err: unknown) {
			setDeleteError(
				err instanceof Error ? err.message : 'Failed to delete contact',
			);
			setDeleting(false);
		}
	};

	const title =
		contact?.name || (contactId != null ? `Contact #${contactId}` : 'Contact');

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={onClose}
			title={title}
			size='md'
			centered
			styles={{
				title: { fontWeight: 700, fontSize: 14 },
				body: { paddingTop: 4, fontSize: 14 },
				header: { minHeight: 0, paddingBottom: 4 },
			}}
		>
			{loading ? (
				<Group justify='center' py='xl'>
					<Loader size='sm' />
				</Group>
			) : error ? (
				<Alert color='red' title='Could not load contact'>
					{error}
				</Alert>
			) : contact ? (
				<Stack gap='md'>
					<SimpleGrid cols={{ base: 1, sm: 2 }} spacing='sm'>
						<DetailField label='Name' value={contact.name} span={2} />
						<DetailField label='Phone' value={contact.phone} />
						<DetailField label='Email' value={contact.email} />
					</SimpleGrid>

					{deleteError ? (
						<Alert color='red' title='Could not delete contact'>
							{deleteError}
						</Alert>
					) : null}

					<Group justify='space-between' gap={6} wrap='nowrap'>
						{onDelete ? (
							<Button
								color='red'
								variant='light'
								leftSection={<Trash2 size={16} />}
								onClick={() => void handleDelete()}
								loading={deleting}
								disabled={deleting}
							>
								Delete
							</Button>
						) : (
							<span />
						)}
						<Group gap={6} wrap='nowrap'>
							<Button variant='default' onClick={onClose} disabled={deleting}>
								Close
							</Button>
							{onEdit ? (
								<Button
									color='brand'
									leftSection={<Pencil size={16} />}
									onClick={() => onEdit(contact)}
									disabled={deleting}
								>
									Edit
								</Button>
							) : null}
						</Group>
					</Group>
				</Stack>
			) : null}
		</KeyboardAwareModal>
	);
}
