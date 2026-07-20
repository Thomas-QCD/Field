import { useEffect, useState } from 'react';
import {
	Modal,
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
import { getAddress, type Address } from '../api/addresses';

interface AddressDetailModalProps {
	addressId: number | null;
	opened: boolean;
	onClose: () => void;
	onEdit?: (address: Address) => void;
	onDelete?: (address: Address) => Promise<void>;
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

export function AddressDetailModal({
	addressId,
	opened,
	onClose,
	onEdit,
	onDelete,
}: AddressDetailModalProps) {
	const [address, setAddress] = useState<Address | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	useEffect(() => {
		if (!opened || addressId == null) {
			setAddress(null);
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
		setAddress(null);

		getAddress(addressId, controller.signal)
			.then((next) => {
				if (!controller.signal.aborted) setAddress(next);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load address');
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [opened, addressId]);

	const handleDelete = async () => {
		if (!address || !onDelete) return;
		const label = address.addressName || address.streetLine || `#${address.id}`;
		if (!window.confirm(`Delete address “${label}”?`)) return;
		setDeleting(true);
		setDeleteError(null);
		try {
			await onDelete(address);
		} catch (err: unknown) {
			setDeleteError(
				err instanceof Error ? err.message : 'Failed to delete address',
			);
			setDeleting(false);
		}
	};

	const title =
		address?.addressName ||
		address?.streetLine ||
		(addressId != null ? `Address #${addressId}` : 'Address');

	return (
		<Modal
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
				<Alert color='red' title='Could not load address'>
					{error}
				</Alert>
			) : address ? (
				<Stack gap='md'>
					<SimpleGrid cols={{ base: 1, sm: 2 }} spacing='sm'>
						<DetailField label='Name' value={address.addressName} />
						<DetailField label='Building' value={address.building} />
						<DetailField
							label='Street'
							value={address.streetLine}
							span={2}
						/>
						<DetailField label='Notes' value={address.notes} span={2} />
					</SimpleGrid>

					{deleteError ? (
						<Alert color='red' title='Could not delete address'>
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
									onClick={() => onEdit(address)}
									disabled={deleting}
								>
									Edit
								</Button>
							) : null}
						</Group>
					</Group>
				</Stack>
			) : null}
		</Modal>
	);
}
