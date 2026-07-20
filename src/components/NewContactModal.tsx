import { useEffect, useState } from 'react';
import {
	Modal,
	Stack,
	Group,
	TextInput,
	Button,
	Alert,
} from '@mantine/core';
import { Mail, Phone, Save, UserRound, X, Plus } from 'lucide-react';

export interface NewContactFormValues {
	name: string;
	phone: string;
	email: string;
}

function createEmptyForm(): NewContactFormValues {
	return { name: '', phone: '', email: '' };
}

interface NewContactModalProps {
	opened: boolean;
	onClose: () => void;
	/** When set, modal is in edit mode and form is seeded from these values. */
	initialValues?: NewContactFormValues | null;
	/** Override create vs edit. Defaults to true when initialValues is set. */
	isEdit?: boolean;
	/** When false, hides Save & Add Another (e.g. nested from task modal). */
	allowAddAnother?: boolean;
	/** Passed through to Mantine Modal (use when nesting above another modal). */
	zIndex?: number;
	onSave?: (
		values: NewContactFormValues,
		addAnother: boolean,
	) => void | Promise<void>;
}

const inputSize = 'sm' as const;

export function NewContactModal({
	opened,
	onClose,
	initialValues = null,
	isEdit: isEditProp,
	allowAddAnother = true,
	zIndex,
	onSave,
}: NewContactModalProps) {
	const isEdit = isEditProp ?? initialValues != null;
	const [form, setForm] = useState<NewContactFormValues>(createEmptyForm);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		if (!opened) return;
		setForm(initialValues ? { ...initialValues } : createEmptyForm());
		setSaveError(null);
	}, [opened, initialValues]);

	const update = <K extends keyof NewContactFormValues>(
		key: K,
		value: NewContactFormValues[K],
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
		if (!form.name.trim()) {
			setSaveError('Name is required');
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
				err instanceof Error ? err.message : 'Failed to save contact',
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			opened={opened}
			onClose={handleClose}
			title={isEdit ? 'Edit Contact' : 'New Contact'}
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
					placeholder='Contact name'
					value={form.name}
					onChange={(e) => update('name', e.currentTarget.value)}
					leftSection={<UserRound size={16} />}
					required
					disabled={saving}
					data-autofocus
				/>
				<TextInput
					size={inputSize}
					label='Phone'
					placeholder='Phone number'
					value={form.phone}
					onChange={(e) => update('phone', e.currentTarget.value)}
					leftSection={<Phone size={16} />}
					disabled={saving}
				/>
				<TextInput
					size={inputSize}
					label='Email'
					placeholder='Email address'
					value={form.email}
					onChange={(e) => update('email', e.currentTarget.value)}
					leftSection={<Mail size={16} />}
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
		</Modal>
	);
}
