import { useEffect, useState } from 'react';
import {
	Stack,
	Group,
	TextInput,
	Textarea,
	Button,
	Alert,
} from '@mantine/core';
import { Building2, MapPin, Save, StickyNote, X, Plus } from 'lucide-react';
import { KeyboardAwareModal } from './KeyboardAwareModal';

export interface NewAddressFormValues {
	addressName: string;
	streetLine: string;
	building: string;
	notes: string;
}

function createEmptyForm(): NewAddressFormValues {
	return {
		addressName: '',
		streetLine: '',
		building: '',
		notes: '',
	};
}

interface NewAddressModalProps {
	opened: boolean;
	onClose: () => void;
	/** When set, modal is in edit mode and form is seeded from these values. */
	initialValues?: NewAddressFormValues | null;
	/** Override create vs edit. Defaults to true when initialValues is set. */
	isEdit?: boolean;
	/** When false, hides Save & Add Another (e.g. nested from task modal). */
	allowAddAnother?: boolean;
	/** Passed through to Mantine Modal (use when nesting above another modal). */
	zIndex?: number;
	onSave?: (
		values: NewAddressFormValues,
		addAnother: boolean,
	) => void | Promise<void>;
}

const inputSize = 'sm' as const;

export function NewAddressModal({
	opened,
	onClose,
	initialValues = null,
	isEdit: isEditProp,
	allowAddAnother = true,
	zIndex,
	onSave,
}: NewAddressModalProps) {
	const isEdit = isEditProp ?? initialValues != null;
	const [form, setForm] = useState<NewAddressFormValues>(createEmptyForm);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		if (!opened) return;
		setForm(initialValues ? { ...initialValues } : createEmptyForm());
		setSaveError(null);
	}, [opened, initialValues]);

	const update = <K extends keyof NewAddressFormValues>(
		key: K,
		value: NewAddressFormValues[K],
	) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const reset = () => {
		setForm(initialValues ? { ...initialValues } : createEmptyForm());
		setSaveError(null);
	};

	const handleClose = () => {
		if (saving) return;
		reset();
		onClose();
	};

	const handleSave = async (addAnother: boolean) => {
		if (saving) return;
		if (!form.streetLine.trim()) {
			setSaveError('Street is required');
			return;
		}
		setSaving(true);
		setSaveError(null);
		try {
			await onSave?.(form, addAnother);
			if (addAnother) {
				setForm(createEmptyForm());
				setSaveError(null);
			} else {
				reset();
				onClose();
			}
		} catch (err: unknown) {
			setSaveError(
				err instanceof Error ? err.message : 'Failed to save address',
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={handleClose}
			title={isEdit ? 'Edit Address' : 'New Address'}
			size='md'
			centered
			zIndex={zIndex}
			closeOnClickOutside={false}
			closeOnEscape={!saving}
			styles={{
				title: { fontWeight: 700, fontSize: 14 },
				body: { paddingTop: 4, fontSize: 14 },
				header: { minHeight: 0, paddingBottom: 4 },
			}}
		>
			<Stack gap={6}>
				{saveError ? (
					<Alert color='red' title='Could not save' py={8}>
						{saveError}
					</Alert>
				) : null}

				<TextInput
					size={inputSize}
					label='Name'
					placeholder='Venue / location name'
					value={form.addressName}
					onChange={(e) => update('addressName', e.currentTarget.value)}
					leftSection={<MapPin size={16} />}
					disabled={saving}
					data-autofocus
				/>
				<TextInput
					size={inputSize}
					label='Street'
					placeholder='Street address'
					value={form.streetLine}
					onChange={(e) => update('streetLine', e.currentTarget.value)}
					leftSection={<MapPin size={16} />}
					required
					disabled={saving}
				/>
				<TextInput
					size={inputSize}
					label='Building'
					placeholder='Building / suite'
					value={form.building}
					onChange={(e) => update('building', e.currentTarget.value)}
					leftSection={<Building2 size={16} />}
					disabled={saving}
				/>
				<Textarea
					size={inputSize}
					label='Notes'
					placeholder='Access notes'
					value={form.notes}
					onChange={(e) => update('notes', e.currentTarget.value)}
					leftSection={<StickyNote size={16} />}
					minRows={2}
					autosize
					disabled={saving}
				/>

				<Group justify='flex-end' gap={6} mt={4} wrap='wrap'>
					<Button
						size='sm'
						variant='default'
						leftSection={<X size={16} />}
						onClick={handleClose}
						disabled={saving}
					>
						Close
					</Button>
					{!isEdit && allowAddAnother ? (
						<Button
							size='sm'
							variant='default'
							leftSection={<Plus size={16} />}
							onClick={() => void handleSave(true)}
							loading={saving}
						>
							Save & Add Another
						</Button>
					) : null}
					<Button
						size='sm'
						color='brand'
						leftSection={<Save size={16} />}
						onClick={() => void handleSave(false)}
						loading={saving}
					>
						{isEdit ? 'Save' : 'Save & Close'}
					</Button>
				</Group>
			</Stack>
		</KeyboardAwareModal>
	);
}
