import { useEffect, useId, useRef, useState } from 'react';
import {
	Stack,
	Group,
	TextInput,
	Textarea,
	Select,
	MultiSelect,
	Autocomplete,
	NumberInput,
	Button,
	Text,
	SimpleGrid,
	Alert,
	UnstyledButton,
	Pill,
	Input,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
	ClipboardList,
	StickyNote,
	MapPin,
	Building2,
	Calendar,
	Users,
	UserRound,
	Save,
	X,
	Plus,
	Paperclip,
	Trash2,
} from 'lucide-react';
import type { TaskType } from '../types/task';
import {
	attachmentAcceptAttr,
	validateAttachmentFile,
} from '../api/attachments';
import { createContact, listContacts } from '../api/contacts';
import { createAddress, listAddresses } from '../api/addresses';
import { listCrewUsers } from '../api/users';
import { formatShortName } from '../formatName';
import { KeyboardAwareModal } from './KeyboardAwareModal';
import { NewContactModal, type NewContactFormValues } from './NewContactModal';
import { NewAddressModal, type NewAddressFormValues } from './NewAddressModal';
import { TaskAttachments } from './TaskAttachments';
import { TaskDescEditor } from './TaskDescEditor';

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
	{ value: 'Delivery', label: 'Delivery' },
	{ value: 'Install', label: 'Install' },
	{ value: 'Removal', label: 'Removal' },
	{ value: 'Site Survey', label: 'Site Survey' },
	{ value: 'Pickup', label: 'Pickup' },
	{ value: 'Other', label: 'Other' },
];

const YES_NO_OPTIONS = [
	{ value: 'false', label: 'No' },
	{ value: 'true', label: 'Yes' },
];

const inputSize = 'sm' as const;

/** Clear (X) control for TextInput / Textarea — Mantine only wires clearable on select-like inputs. */
function textClearSection(
	hasValue: boolean,
	onClear: () => void,
	disabled?: boolean,
) {
	if (!hasValue || disabled) return undefined;
	return (
		<Input.ClearButton
			onClick={(e) => {
				e.stopPropagation();
				onClear();
			}}
		/>
	);
}

/** Dropdown only after the user types — click/focus on an empty field stays closed. */
function useTypeToOpenDropdown() {
	const [opened, setOpened] = useState(false);
	const suppressOpenRef = useRef(false);

	return {
		openOnFocus: false as const,
		dropdownOpened: opened,
		onDropdownClose: () => setOpened(false),
		onSearchChange: (value: string) => {
			if (suppressOpenRef.current) {
				suppressOpenRef.current = false;
				return;
			}
			setOpened(value.trim().length > 0);
		},
		/** Call when Select value changes so label sync does not reopen the menu. */
		suppressNextSearchOpen: () => {
			suppressOpenRef.current = true;
			setOpened(false);
		},
		reset: () => {
			suppressOpenRef.current = false;
			setOpened(false);
		},
	};
}

function defaultDateTimeLocal(hours: number, minutes = 0): string {
	const d = new Date();
	d.setHours(hours, minutes, 0, 0);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Form stores datetime-local (`YYYY-MM-DDTHH:mm`); DateTimePicker uses `YYYY-MM-DD HH:mm:ss`. */
function toDateTimePickerValue(local: string): string | null {
	const trimmed = local.trim();
	if (!trimmed) return null;
	const withSpace = trimmed.includes('T') ? trimmed.replace('T', ' ') : trimmed;
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(withSpace)) {
		return `${withSpace}:00`;
	}
	return withSpace;
}

function fromDateTimePickerValue(value: string | null): string {
	if (!value) return '';
	return value.replace(' ', 'T').slice(0, 16);
}

const dateTimePickerTimeProps = {
	withDropdown: true,
	popoverProps: { withinPortal: false },
	format: '12h' as const,
};

export interface NewTaskFormValues {
	contactIds: number[];
	pocContactId: number | null;
	taskType: TaskType;
	externalKey: string;
	taskDesc: string;
	destinationAddressId: number | null;
	destinationAddressName: string;
	destinationAddress: string;
	destinationBuilding: string;
	destinationNotes: string;
	afterDateTime: string;
	beforeDateTime: string;
	crewMemberIds: string[];
	guys: number | string;
	hours: number | string;
	canStartEarly: string;
	isTimeSpecific: string;
}

/** First contact in the list is always the POC. */
function resolvePocContactId(contactIds: number[]): number | null {
	return contactIds[0] ?? null;
}

/** Keep MultiSelect pills renderable before async options load. */
function withSelectedContactOptions(
	options: { value: string; label: string }[],
	selectedIds: number[],
): { value: string; label: string }[] {
	const byValue = new Map(options.map((o) => [o.value, o] as const));
	for (const id of selectedIds) {
		const value = String(id);
		if (!byValue.has(value)) {
			byValue.set(value, { value, label: `Contact #${id}` });
		}
	}
	return Array.from(byValue.values());
}

function createEmptyForm(): NewTaskFormValues {
	return {
		contactIds: [],
		pocContactId: null,
		taskType: 'Delivery',
		externalKey: '',
		taskDesc: '',
		destinationAddressId: null,
		destinationAddressName: '',
		destinationAddress: '',
		destinationBuilding: '',
		destinationNotes: '',
		afterDateTime: defaultDateTimeLocal(7),
		beforeDateTime: defaultDateTimeLocal(15),
		crewMemberIds: [],
		guys: '',
		hours: '',
		canStartEarly: 'false',
		isTimeSpecific: 'false',
	};
}

interface NewTaskModalProps {
	opened: boolean;
	onClose: () => void;
	/** When set, modal is in edit mode and form is seeded from these values. */
	initialValues?: NewTaskFormValues | null;
	/** Contact pills for edit mode before listContacts returns. */
	initialContactOptions?: { value: string; label: string }[] | null;
	/** Existing task id — enables live attachment upload/list while editing. */
	taskId?: number | null;
	onSave?: (
		values: NewTaskFormValues,
		addAnother: boolean,
		pendingFiles: File[],
	) => void | Promise<void>;
}

export function NewTaskModal({
	opened,
	onClose,
	initialValues = null,
	initialContactOptions = null,
	taskId = null,
	onSave,
}: NewTaskModalProps) {
	const isEdit = initialValues != null;
	const attachmentInputId = useId();
	const attachmentInputRef = useRef<HTMLInputElement>(null);
	const [form, setForm] = useState<NewTaskFormValues>(createEmptyForm);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [attachmentError, setAttachmentError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [crewOptions, setCrewOptions] = useState<
		{ value: string; label: string }[]
	>([]);
	const [crewLoading, setCrewLoading] = useState(false);
	const [contactOptions, setContactOptions] = useState<
		{ value: string; label: string }[]
	>([]);
	const [contactLoading, setContactLoading] = useState(false);
	const [addressOptions, setAddressOptions] = useState<
		{
			value: string;
			label: string;
			streetLine: string;
			building: string;
			notes: string;
		}[]
	>([]);
	const [addressLoading, setAddressLoading] = useState(false);
	const [newContactOpen, setNewContactOpen] = useState(false);
	const [newAddressOpen, setNewAddressOpen] = useState(false);
	const [addressSeed, setAddressSeed] = useState<NewAddressFormValues | null>(
		null,
	);
	const contactDropdown = useTypeToOpenDropdown();
	const addressDropdown = useTypeToOpenDropdown();
	const crewDropdown = useTypeToOpenDropdown();

	const update = <K extends keyof NewTaskFormValues>(
		key: K,
		value: NewTaskFormValues[K],
	) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const reset = () => {
		setForm(initialValues ? { ...initialValues } : createEmptyForm());
		setPendingFiles([]);
		setAttachmentError(null);
		setSaveError(null);
		setNewContactOpen(false);
		setNewAddressOpen(false);
		setAddressSeed(null);
		contactDropdown.reset();
		addressDropdown.reset();
		crewDropdown.reset();
		if (attachmentInputRef.current) attachmentInputRef.current.value = '';
	};

	const addPendingFiles = (fileList: FileList | null) => {
		const files = fileList ? Array.from(fileList) : [];
		if (files.length === 0) return;
		setAttachmentError(null);

		const accepted: File[] = [];
		for (const file of files) {
			const validationError = validateAttachmentFile(file);
			if (validationError) {
				setAttachmentError(validationError);
				continue;
			}
			accepted.push(file);
		}
		if (accepted.length > 0) {
			setPendingFiles((prev) => [...prev, ...accepted]);
		}
		if (attachmentInputRef.current) attachmentInputRef.current.value = '';
	};

	const handleClose = () => {
		if (saving) return;
		reset();
		onClose();
	};

	const openNewAddress = () => {
		const seed: NewAddressFormValues = {
			addressName: form.destinationAddressName,
			streetLine: form.destinationAddress,
			building: form.destinationBuilding,
			notes: form.destinationNotes,
		};
		const hasAny = Object.values(seed).some((v) => v.trim().length > 0);
		setAddressSeed(hasAny ? seed : null);
		setNewAddressOpen(true);
	};

	const handleCreateContact = async (values: NewContactFormValues) => {
		const contact = await createContact({
			name: values.name.trim(),
			title: values.title.trim() || undefined,
			phone: values.phone.trim() || undefined,
			email: values.email.trim() || undefined,
		});
		const name = contact.name.trim();
		const title = contact.title.trim();
		const label = title
			? `${name} (${title})`
			: contact.email
				? `${name} (${contact.email})`
				: name;
		setContactOptions((prev) => {
			if (prev.some((o) => o.value === String(contact.id))) return prev;
			return [...prev, { value: String(contact.id), label }];
		});
		setForm((prev) => {
			if (prev.contactIds.includes(contact.id)) return prev;
			const contactIds = [...prev.contactIds, contact.id];
			return {
				...prev,
				contactIds,
				pocContactId: resolvePocContactId(contactIds),
			};
		});
	};

	const handleCreateAddress = async (values: NewAddressFormValues) => {
		const address = await createAddress({
			addressName: values.addressName.trim() || undefined,
			streetLine: values.streetLine.trim(),
			building: values.building.trim() || undefined,
			notes: values.notes.trim() || undefined,
		});
		const label = address.addressName || address.streetLine;
		setAddressOptions((prev) => {
			if (prev.some((o) => o.value === String(address.id))) return prev;
			return [
				...prev,
				{
					value: String(address.id),
					label,
					streetLine: address.streetLine,
					building: address.building,
					notes: address.notes,
				},
			];
		});
		setForm((prev) => ({
			...prev,
			destinationAddressId: address.id,
			destinationAddressName: label,
			destinationAddress: address.streetLine,
			destinationBuilding: address.building,
			destinationNotes: address.notes,
		}));
	};

	const handleSave = async (addAnother: boolean) => {
		if (saving) return;
		setSaving(true);
		setSaveError(null);
		try {
			await onSave?.(form, addAnother, pendingFiles);
			if (addAnother) {
				setForm(createEmptyForm());
				setPendingFiles([]);
				setAttachmentError(null);
				setSaveError(null);
				contactDropdown.reset();
				addressDropdown.reset();
				crewDropdown.reset();
				if (attachmentInputRef.current) attachmentInputRef.current.value = '';
			} else {
				reset();
				onClose();
			}
		} catch (err: unknown) {
			setSaveError(err instanceof Error ? err.message : 'Failed to save task');
		} finally {
			setSaving(false);
		}
	};

	useEffect(() => {
		if (!opened) return;
		setForm(initialValues ? { ...initialValues } : createEmptyForm());
		setPendingFiles([]);
		setAttachmentError(null);
		setSaveError(null);
		setNewContactOpen(false);
		setNewAddressOpen(false);
		setAddressSeed(null);
		if (initialContactOptions?.length) {
			setContactOptions((prev) => {
				const byValue = new Map(prev.map((o) => [o.value, o] as const));
				for (const option of initialContactOptions) {
					byValue.set(option.value, option);
				}
				return Array.from(byValue.values());
			});
		}
		if (attachmentInputRef.current) attachmentInputRef.current.value = '';
	}, [opened, initialValues, initialContactOptions]);

	useEffect(() => {
		if (!opened) return;

		const controller = new AbortController();
		setCrewLoading(true);
		setContactLoading(true);
		setAddressLoading(true);

		listCrewUsers(controller.signal)
			.then((users) => {
				setCrewOptions(
					users.map((u) => ({
						value: u.id,
						label: formatShortName(u.displayName),
					})),
				);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				console.error(err);
				setCrewOptions([]);
			})
			.finally(() => {
				if (!controller.signal.aborted) setCrewLoading(false);
			});

		listContacts(controller.signal)
			.then((contacts) => {
				setContactOptions(
					contacts.map((c) => {
						const name = c.name.trim();
						const title = c.title.trim();
						return {
							value: String(c.id),
							label: title
								? `${name} (${title})`
								: c.email
									? `${name} (${c.email})`
									: name,
						};
					}),
				);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				console.error(err);
				setContactOptions([]);
			})
			.finally(() => {
				if (!controller.signal.aborted) setContactLoading(false);
			});

		listAddresses(controller.signal)
			.then((addresses) => {
				setAddressOptions(
					addresses.map((a) => ({
						value: String(a.id),
						label: a.addressName || a.streetLine,
						streetLine: a.streetLine,
						building: a.building,
						notes: a.notes,
					})),
				);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				console.error(err);
				setAddressOptions([]);
			})
			.finally(() => {
				if (!controller.signal.aborted) setAddressLoading(false);
			});

		return () => controller.abort();
	}, [opened]);

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={handleClose}
			title={isEdit ? 'Edit Task' : 'New Task'}
			size='800px'
			centered
			closeOnClickOutside={false}
			closeOnEscape={!saving}
			classNames={{ content: 'task-form-modal' }}
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

				<SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
					<Select
						size={inputSize}
						data={TASK_TYPE_OPTIONS}
						value={form.taskType}
						onChange={(v) => update('taskType', (v as TaskType) ?? 'Delivery')}
						leftSection={<ClipboardList size={16} />}
						allowDeselect={false}
						disabled={saving}
					/>
					<TextInput
						size={inputSize}
						placeholder='Job Number'
						value={form.externalKey}
						onChange={(e) => update('externalKey', e.currentTarget.value)}
						maxLength={100}
						disabled={saving}
					/>
				</SimpleGrid>

				<TaskDescEditor
					value={form.taskDesc}
					onChange={(html) => update('taskDesc', html)}
					disabled={saving}
				/>

				<Group justify='space-between' align='center' gap={6} wrap='nowrap'>
					<Text fz={14} fw={600}>
						Contacts
					</Text>
					<Button
						size='compact-sm'
						variant='subtle'
						leftSection={<Plus size={14} />}
						onClick={() => setNewContactOpen(true)}
						disabled={saving}
					>
						New contact
					</Button>
				</Group>
				<MultiSelect
					size={inputSize}
					data={withSelectedContactOptions(contactOptions, form.contactIds)}
					value={form.contactIds.map(String)}
					onChange={(v) => {
						const contactIds = v
							.map((id) => Number(id))
							.filter((n) => Number.isInteger(n));
						setForm((prev) => ({
							...prev,
							contactIds,
							pocContactId: resolvePocContactId(contactIds),
						}));
					}}
					placeholder={form.contactIds.length === 0 ? 'No contacts' : undefined}
					leftSection={<UserRound size={16} />}
					loading={contactLoading}
					comboboxProps={{ shadow: 'xl' }}
					maxDropdownHeight={400}
					styles={{
						dropdown: {
							backgroundColor: 'var(--mantine-color-gray-2)',
							border: '1px solid var(--mantine-primary-color-filled)',
						},
						option: {
							borderRadius: 4,
						},
					}}
					renderPill={({ option, onRemove }) => {
						if (!option) return null;
						const isPoc =
							form.contactIds[0] != null &&
							String(form.contactIds[0]) === option.value;
						return (
							<Pill
								withRemoveButton
								onRemove={onRemove}
								disabled={saving}
								className={
									isPoc
										? 'task-contact-pill task-contact-pill--poc'
										: 'task-contact-pill'
								}
							>
								{option.label}
								{isPoc ? (
									<span className='task-contact-pill-poc'>POC</span>
								) : null}
							</Pill>
						);
					}}
					searchable
					clearable
					hidePickedOptions
					openOnFocus={contactDropdown.openOnFocus}
					dropdownOpened={contactDropdown.dropdownOpened}
					onDropdownClose={contactDropdown.onDropdownClose}
					onSearchChange={contactDropdown.onSearchChange}
					nothingFoundMessage={
						contactLoading ? 'Loading…' : 'No contacts found'
					}
					disabled={saving}
				/>

				<Group justify='space-between' align='center' gap={6} wrap='nowrap'>
					<Text fz={14} fw={600}>
						Destination
					</Text>
					<Button
						size='compact-sm'
						variant='subtle'
						leftSection={<Plus size={14} />}
						onClick={openNewAddress}
						disabled={saving}
					>
						New address
					</Button>
				</Group>
				<Stack gap={6}>
					<Autocomplete
						size={inputSize}
						data={addressOptions.map(({ value, label }) => ({ value, label }))}
						value={form.destinationAddressName}
						onChange={(name) => {
							addressDropdown.onSearchChange(name);
							setForm((prev) => {
								const linked =
									prev.destinationAddressId != null
										? addressOptions.find(
												(a) => a.value === String(prev.destinationAddressId),
											)
										: undefined;
								return {
									...prev,
									destinationAddressName: name,
									// Keep link when Autocomplete echoes the selected label after pick.
									destinationAddressId:
										linked?.label === name ? prev.destinationAddressId : null,
								};
							});
						}}
						onOptionSubmit={(value) => {
							addressDropdown.suppressNextSearchOpen();
							const selected = addressOptions.find((a) => a.value === value);
							if (!selected) return;
							setForm((prev) => ({
								...prev,
								destinationAddressId: Number(selected.value),
								destinationAddressName: selected.label,
								destinationAddress: selected.streetLine,
								destinationBuilding: selected.building,
								destinationNotes: selected.notes,
							}));
						}}
						placeholder={addressLoading ? 'Loading venues…' : 'Venue'}
						leftSection={<Building2 size={16} />}
						loading={addressLoading}
						clearable
						openOnFocus={addressDropdown.openOnFocus}
						dropdownOpened={addressDropdown.dropdownOpened}
						onDropdownClose={addressDropdown.onDropdownClose}
						comboboxProps={{ shadow: 'xl' }}
						maxDropdownHeight={400}
						styles={{
							dropdown: {
								backgroundColor: 'var(--mantine-color-gray-2)',
								border: '1px solid var(--mantine-primary-color-filled)',
							},
							option: {
								borderRadius: 4,
							},
						}}
						disabled={saving}
					/>
					<TextInput
						size={inputSize}
						placeholder='Street address'
						value={form.destinationAddress}
						onChange={(e) => {
							const value = e.currentTarget.value;
							setForm((prev) => ({
								...prev,
								destinationAddress: value,
								destinationAddressId: null,
							}));
						}}
						leftSection={<MapPin size={16} />}
						rightSection={textClearSection(
							form.destinationAddress.length > 0,
							() =>
								setForm((prev) => ({
									...prev,
									destinationAddress: '',
									destinationAddressId: null,
								})),
							saving,
						)}
						rightSectionPointerEvents='auto'
						disabled={saving}
					/>
					<TextInput
						size={inputSize}
						placeholder='Building, floor and room'
						value={form.destinationBuilding}
						onChange={(e) => {
							const value = e.currentTarget.value;
							setForm((prev) => ({
								...prev,
								destinationBuilding: value,
								destinationAddressId: null,
							}));
						}}
						leftSection={<Building2 size={16} />}
						rightSection={textClearSection(
							form.destinationBuilding.length > 0,
							() =>
								setForm((prev) => ({
									...prev,
									destinationBuilding: '',
									destinationAddressId: null,
								})),
							saving,
						)}
						rightSectionPointerEvents='auto'
						disabled={saving}
					/>
					<Textarea
						size={inputSize}
						autosize
						placeholder='Instructions or notes'
						minRows={2}
						resize='vertical'
						value={form.destinationNotes}
						onChange={(e) => {
							const value = e.currentTarget.value;
							setForm((prev) => ({
								...prev,
								destinationNotes: value,
								destinationAddressId: null,
							}));
						}}
						leftSection={<StickyNote size={16} />}
						leftSectionProps={{
							style: { alignItems: 'flex-start', paddingTop: 10 },
						}}
						rightSection={textClearSection(
							form.destinationNotes.length > 0,
							() =>
								setForm((prev) => ({
									...prev,
									destinationNotes: '',
									destinationAddressId: null,
								})),
							saving,
						)}
						rightSectionPointerEvents='auto'
						disabled={saving}
					/>
				</Stack>

				<SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
					<DateTimePicker
						size={inputSize}
						label='Complete After'
						valueFormat='dddd, MMMM DD, h:mm A'
						placeholder='Pick date and time'
						value={toDateTimePickerValue(form.afterDateTime)}
						onChange={(v) =>
							update('afterDateTime', fromDateTimePickerValue(v))
						}
						leftSection={<Calendar size={16} />}
						clearable
						timePickerProps={dateTimePickerTimeProps}
						disabled={saving}
					/>
					<DateTimePicker
						size={inputSize}
						label='Complete Before'
						valueFormat='dddd, MMMM DD, h:mm A'
						placeholder='Pick date and time'
						value={toDateTimePickerValue(form.beforeDateTime)}
						onChange={(v) =>
							update('beforeDateTime', fromDateTimePickerValue(v))
						}
						leftSection={<Calendar size={16} />}
						clearable
						timePickerProps={dateTimePickerTimeProps}
						disabled={saving}
					/>
				</SimpleGrid>

				<Text fz={14} fw={600}>
					Assign To
				</Text>
				<MultiSelect
					size={inputSize}
					data={crewOptions}
					value={form.crewMemberIds}
					onChange={(v) => update('crewMemberIds', v)}
					placeholder={
						form.crewMemberIds.length === 0 ? 'Crew not assigned' : undefined
					}
					leftSection={<Users size={16} />}
					loading={crewLoading}
					comboboxProps={{ shadow: 'xl' }}
					maxDropdownHeight={400}
					styles={{
						dropdown: {
							backgroundColor: 'var(--mantine-color-gray-2)',
							border: '1px solid var(--mantine-primary-color-filled)',
						},
						option: {
							borderRadius: 4,
						},
					}}
					searchable
					clearable
					hidePickedOptions
					openOnFocus={crewDropdown.openOnFocus}
					dropdownOpened={crewDropdown.dropdownOpened}
					onDropdownClose={crewDropdown.onDropdownClose}
					onSearchChange={crewDropdown.onSearchChange}
					nothingFoundMessage={
						crewLoading ? 'Loading…' : 'No crew members found'
					}
					disabled={saving}
				/>
				<br />
				<SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
					<NumberInput
						size={inputSize}
						label='Guys'
						min={0}
						value={form.guys}
						onChange={(v) => update('guys', v)}
						disabled={saving}
					/>
					<NumberInput
						size={inputSize}
						label='Hours'
						min={0}
						value={form.hours}
						onChange={(v) => update('hours', v)}
						disabled={saving}
					/>
				</SimpleGrid>

				<SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
					<Select
						size={inputSize}
						label='Can start early?'
						data={YES_NO_OPTIONS}
						value={form.canStartEarly}
						onChange={(v) => update('canStartEarly', v ?? 'false')}
						allowDeselect={false}
						disabled={saving}
					/>
					<Select
						size={inputSize}
						label='Time specific?'
						data={YES_NO_OPTIONS}
						value={form.isTimeSpecific}
						onChange={(v) => update('isTimeSpecific', v ?? 'false')}
						allowDeselect={false}
						disabled={saving}
					/>
				</SimpleGrid>
				<br />

				<Text fz={14} fw={600}>
					Attachments
				</Text>
				{taskId != null ? (
					<TaskAttachments taskId={taskId} />
				) : (
					<Stack gap='sm' className='task-attachments'>
						{attachmentError ? (
							<Alert
								color='red'
								title='Attachments'
								withCloseButton
								onClose={() => setAttachmentError(null)}
								py={8}
							>
								{attachmentError}
							</Alert>
						) : null}

						<ul className='task-attachments-list'>
							{pendingFiles.map((file, index) => (
								<li
									key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
									className='task-attachments-item'
								>
									<div className='task-attachments-item-main'>
										<Text size='sm' fw={600} lineClamp={1}>
											{file.name}
										</Text>
										<Text size='xs' c='dimmed' mt={2}>
											{formatBytes(file.size)}
										</Text>
									</div>
									<UnstyledButton
										className='task-attachments-icon-btn task-attachments-icon-btn--danger'
										aria-label={`Remove ${file.name}`}
										disabled={saving}
										onClick={() =>
											setPendingFiles((prev) =>
												prev.filter((_, i) => i !== index),
											)
										}
									>
										<Trash2 size={16} strokeWidth={2} aria-hidden />
									</UnstyledButton>
								</li>
							))}
						</ul>

						<input
							ref={attachmentInputRef}
							id={attachmentInputId}
							type='file'
							accept={attachmentAcceptAttr()}
							multiple
							className='task-attachments-input'
							disabled={saving}
							onChange={(e) => addPendingFiles(e.target.files)}
						/>
						<Button
							variant='light'
							color='brand'
							leftSection={<Paperclip size={16} />}
							disabled={saving}
							onClick={() => attachmentInputRef.current?.click()}
						>
							Add attachment
						</Button>
					</Stack>
				)}

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
					{!isEdit ? (
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

			<NewContactModal
				opened={newContactOpen}
				onClose={() => setNewContactOpen(false)}
				isEdit={false}
				allowAddAnother={false}
				onSave={handleCreateContact}
				zIndex={400}
			/>
			<NewAddressModal
				opened={newAddressOpen}
				onClose={() => {
					setNewAddressOpen(false);
					setAddressSeed(null);
				}}
				initialValues={addressSeed}
				isEdit={false}
				allowAddAnother={false}
				onSave={handleCreateAddress}
				zIndex={400}
			/>
		</KeyboardAwareModal>
	);
}
