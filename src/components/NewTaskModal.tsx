import {
	useEffect,
	useId,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
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
	Input,
	Switch,
	ActionIcon,
	type ComboboxItem,
	type ComboboxLikeRenderOptionInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
	ClipboardCheck,
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
	Truck,
	Wrench,
	PackageMinus,
	Package,
	CircleHelp,
	HardHat,
	CornerDownLeft,
	type LucideIcon,
} from 'lucide-react';
import type { TaskType } from '../types/task';
import {
	EQUIPMENT_OPTIONS,
	taskTypeUsesEquipment,
} from '../../shared/equipment.js';
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

const TASK_TYPE_ICONS: Record<TaskType, LucideIcon> = {
	Delivery: Truck,
	Install: Wrench,
	Removal: PackageMinus,
	'Site Survey': ClipboardCheck,
	Pickup: Package,
	Other: CircleHelp,
};

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
	{ value: 'Delivery', label: 'Delivery' },
	{ value: 'Install', label: 'Install' },
	{ value: 'Removal', label: 'Removal' },
	{ value: 'Site Survey', label: 'Site Survey' },
	{ value: 'Pickup', label: 'Pickup' },
	{ value: 'Other', label: 'Other' },
];

const inputSize = 'sm' as const;

const switchAlignStyles = {
	root: {
		display: 'flex',
		alignItems: 'center',
		minHeight: 36,
	},
};

function TaskFormSection({
	title,
	action,
	children,
}: {
	title?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className='task-form-section'>
			{title ? (
				<div className='task-form-section-header'>
					<h3 className='task-form-section-title'>{title}</h3>
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

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

/** One-shot grow-to-content (keeps CSS resize usable — unlike Mantine autosize). */
function fitTextareaToContent(el: HTMLTextAreaElement | null) {
	if (!el) return;
	el.style.height = 'auto';
	el.style.height = `${el.scrollHeight}px`;
}

/** Dropdown only after the user types — click/focus on an empty field stays closed. */
function useTypeToOpenDropdown() {
	const [opened, setOpened] = useState(false);
	const [search, setSearch] = useState('');
	const suppressOpenRef = useRef(false);

	const clear = () => {
		suppressOpenRef.current = false;
		setSearch('');
		setOpened(false);
	};

	return {
		openOnFocus: false as const,
		search,
		dropdownOpened: opened,
		onDropdownClose: () => setOpened(false),
		onSearchChange: (value: string) => {
			setSearch(value);
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
		clearSearch: clear,
		reset: clear,
	};
}

type ComboboxOptionLike = string | { value: string; label: string };

/**
 * Value of the only option matching the search, or null when zero or many
 * match. Mirrors Mantine's default filter (case-insensitive substring).
 */
function singleSearchMatch(
	options: readonly ComboboxOptionLike[],
	search: string,
): string | null {
	const query = search.trim().toLowerCase();
	if (query.length === 0) return null;
	let match: string | null = null;
	for (const option of options) {
		const value = typeof option === 'string' ? option : option.value;
		const label = typeof option === 'string' ? option : option.label;
		if (!label.toLowerCase().includes(query)) continue;
		if (match !== null) return null;
		match = value;
	}
	return match;
}

/** True while the user has arrow-keyed to an option — Mantine's Enter owns it. */
function hasHighlightedOption(input: HTMLInputElement): boolean {
	const listId = input.getAttribute('aria-controls');
	if (!listId) return false;
	return (
		document.getElementById(listId)?.querySelector('[data-combobox-selected]') !=
		null
	);
}

/**
 * Enter picks `match` — the only option left after filtering — so the user can
 * keep typing the next entry.
 */
function singleMatchEnter(
	match: string | null,
	onSelect: (value: string) => void,
) {
	return (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
		if (match == null) return;
		if (hasHighlightedOption(event.currentTarget)) return;
		event.preventDefault();
		onSelect(match);
	};
}

/** Marks the option Enter would pick with a dimmed Enter key glyph. */
function renderOptionWithEnterHint(match: string | null) {
	return ({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>) => (
		<>
			<span>{option.label}</span>
			{option.value === match ? (
				<CornerDownLeft
					size={14}
					className='task-form-enter-hint'
					aria-hidden
				/>
			) : null}
		</>
	);
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
	/** Subset of contactIds that should receive automated task emails. */
	receiveEmailContactIds: number[];
	taskType: TaskType;
	externalKey: string;
	jobTitle: string;
	taskDesc: string;
	destinationAddressId: number | null;
	destinationAddressName: string;
	destinationAddress: string;
	destinationBuilding: string;
	destinationNotes: string;
	afterDateTime: string;
	beforeDateTime: string;
	crewMemberIds: string[];
	/** First crew member in crewMemberIds is always the lead. */
	leadCrewMemberId: string | null;
	guys: number | string;
	hours: number | string;
	canStartEarly: boolean;
	isTimeSpecific: boolean;
	isUrgent: boolean;
	equipment: string[];
}

/** First contact in the list is always the POC. */
function resolvePocContactId(contactIds: number[]): number | null {
	return contactIds[0] ?? null;
}

/** First crew member in the list is always the lead; the rest are sub. */
function resolveLeadCrewMemberId(crewMemberIds: string[]): string | null {
	return crewMemberIds[0] ?? null;
}

/** POC defaults to receiving email; others default off. */
function defaultReceiveEmailOnAdd(
	contactIds: number[],
	newContactId: number,
	prevReceiveEmailIds: number[],
): number[] {
	const isPoc = contactIds[0] === newContactId;
	if (isPoc) {
		return prevReceiveEmailIds.includes(newContactId)
			? prevReceiveEmailIds
			: [...prevReceiveEmailIds, newContactId];
	}
	return prevReceiveEmailIds;
}

function createEmptyForm(): NewTaskFormValues {
	return {
		contactIds: [],
		pocContactId: null,
		receiveEmailContactIds: [],
		taskType: 'Delivery',
		externalKey: '',
		jobTitle: '',
		taskDesc: '',
		destinationAddressId: null,
		destinationAddressName: '',
		destinationAddress: '',
		destinationBuilding: '',
		destinationNotes: '',
		afterDateTime: defaultDateTimeLocal(7),
		beforeDateTime: defaultDateTimeLocal(15),
		crewMemberIds: [],
		leadCrewMemberId: null,
		guys: '',
		hours: '',
		canStartEarly: false,
		isTimeSpecific: false,
		isUrgent: false,
		equipment: [],
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
	const destinationNotesRef = useRef<HTMLTextAreaElement>(null);
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
	const [equipmentSearch, setEquipmentSearch] = useState('');

	const update = <K extends keyof NewTaskFormValues>(
		key: K,
		value: NewTaskFormValues[K],
	) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const addContact = (value: string | null) => {
		if (value == null) return;
		const id = Number(value);
		if (!Number.isInteger(id) || id < 1) return;
		contactDropdown.clearSearch();
		setForm((prev) => {
			if (prev.contactIds.includes(id)) return prev;
			const contactIds = [...prev.contactIds, id];
			return {
				...prev,
				contactIds,
				pocContactId: resolvePocContactId(contactIds),
				receiveEmailContactIds: defaultReceiveEmailOnAdd(
					contactIds,
					id,
					prev.receiveEmailContactIds,
				),
			};
		});
	};

	const setCrewMemberIds = (crewMemberIds: string[]) => {
		setForm((prev) => ({
			...prev,
			crewMemberIds,
			leadCrewMemberId: resolveLeadCrewMemberId(crewMemberIds),
		}));
	};

	const setTaskType = (taskType: TaskType) => {
		setEquipmentSearch('');
		setForm((prev) => ({
			...prev,
			taskType,
			equipment: taskTypeUsesEquipment(taskType) ? prev.equipment : [],
		}));
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
		setEquipmentSearch('');
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
				receiveEmailContactIds: defaultReceiveEmailOnAdd(
					contactIds,
					contact.id,
					prev.receiveEmailContactIds,
				),
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
				setEquipmentSearch('');
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

	// Grow once when notes change (venue fill / edit hydrate). Do not use Mantine
	// autosize — it continuously locks height and breaks the resize handle.
	useEffect(() => {
		if (!opened) return;
		const id = requestAnimationFrame(() => {
			fitTextareaToContent(destinationNotesRef.current);
		});
		return () => cancelAnimationFrame(id);
	}, [opened, form.destinationNotes]);

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

	const TaskTypeIcon = TASK_TYPE_ICONS[form.taskType];
	const availableContactOptions = contactOptions.filter(
		(o) => !form.contactIds.includes(Number(o.value)),
	);
	const availableCrewOptions = crewOptions.filter(
		(o) => !form.crewMemberIds.includes(o.value),
	);
	const availableEquipmentOptions = EQUIPMENT_OPTIONS.filter(
		(o) => !form.equipment.includes(o),
	);
	const contactEnterMatch = singleSearchMatch(
		availableContactOptions,
		contactDropdown.search,
	);
	const crewEnterMatch = singleSearchMatch(
		availableCrewOptions,
		crewDropdown.search,
	);
	const equipmentEnterMatch = singleSearchMatch(
		availableEquipmentOptions,
		equipmentSearch,
	);

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={handleClose}
			title={isEdit ? 'Edit Task' : 'New Task'}
			size='1200px'
			centered
			pinFooter
			closeOnClickOutside={false}
			closeOnEscape={!saving}
			classNames={{
				content: 'task-form-modal',
				body: 'task-form-modal-body',
			}}
			styles={{
				title: { fontWeight: 700, fontSize: 14 },
				body: { paddingTop: 4, fontSize: 14 },
				header: { minHeight: 0, paddingBottom: 4 },
			}}
		>
			{saveError ? (
				<Alert color='red' title='Could not save' py={8} mb={6}>
					{saveError}
				</Alert>
			) : null}

			<div className='task-form-scroll'>
				<div className='task-form-layout'>
					<div className='task-form-col'>
						<TaskFormSection title='Details'>
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
								<Select
									size={inputSize}
									data={TASK_TYPE_OPTIONS}
									value={form.taskType}
									onChange={(v) => setTaskType((v as TaskType) ?? 'Delivery')}
									leftSection={<TaskTypeIcon size={16} />}
									renderOption={({ option }) => {
										const Icon = TASK_TYPE_ICONS[option.value as TaskType];
										return (
											<Group gap={8} wrap='nowrap'>
												<Icon size={16} />
												<span>{option.label}</span>
											</Group>
										);
									}}
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
							<TextInput
								size={inputSize}
								placeholder='Job Title'
								value={form.jobTitle}
								onChange={(e) => update('jobTitle', e.currentTarget.value)}
								maxLength={255}
								disabled={saving}
							/>
							<TaskDescEditor
								value={form.taskDesc}
								onChange={(html) => update('taskDesc', html)}
								disabled={saving}
							/>
						</TaskFormSection>

						<TaskFormSection
							title='Contacts'
							action={
								<Button
									size='compact-sm'
									variant='subtle'
									leftSection={<Plus size={14} />}
									onClick={() => setNewContactOpen(true)}
									disabled={saving}
								>
									New contact
								</Button>
							}
						>
							<Select
								size={inputSize}
								data={availableContactOptions}
								value={null}
								onChange={addContact}
								onKeyDown={singleMatchEnter(contactEnterMatch, addContact)}
								renderOption={renderOptionWithEnterHint(contactEnterMatch)}
								placeholder='Add contact'
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
								searchable
								clearable
								openOnFocus={contactDropdown.openOnFocus}
								dropdownOpened={contactDropdown.dropdownOpened}
								onDropdownClose={contactDropdown.onDropdownClose}
								searchValue={contactDropdown.search}
								onSearchChange={contactDropdown.onSearchChange}
								nothingFoundMessage={
									contactLoading ? 'Loading…' : 'No contacts found'
								}
								disabled={saving}
							/>
							{form.contactIds.length > 0 ? (
								<Stack gap={6} className='task-form-contacts'>
									{form.contactIds.map((contactId, index) => {
										const option = contactOptions.find(
											(o) => o.value === String(contactId),
										);
										const label = option?.label ?? `Contact #${contactId}`;
										const isPoc = index === 0;
										const receivesEmail =
											form.receiveEmailContactIds.includes(contactId);
										return (
											<div
												key={contactId}
												className={
													isPoc
														? 'task-form-contact task-form-contact--poc'
														: 'task-form-contact'
												}
											>
												<div className='task-form-contact-info'>
													<span className='task-form-contact-name'>
														{label}
													</span>
													{isPoc ? (
														<span className='task-form-contact-poc'>POC</span>
													) : null}
												</div>
												<Switch
													size='sm'
													label='Email'
													checked={receivesEmail}
													onChange={(e) => {
														const checked = e.currentTarget.checked;
														setForm((prev) => {
															const has =
																prev.receiveEmailContactIds.includes(contactId);
															if (checked && !has) {
																return {
																	...prev,
																	receiveEmailContactIds: [
																		...prev.receiveEmailContactIds,
																		contactId,
																	],
																};
															}
															if (!checked && has) {
																return {
																	...prev,
																	receiveEmailContactIds:
																		prev.receiveEmailContactIds.filter(
																			(id) => id !== contactId,
																		),
																};
															}
															return prev;
														});
													}}
													disabled={saving}
													styles={switchAlignStyles}
												/>
												<ActionIcon
													variant='subtle'
													color='gray'
													size='sm'
													aria-label={`Remove ${label}`}
													onClick={() => {
														setForm((prev) => {
															const contactIds = prev.contactIds.filter(
																(id) => id !== contactId,
															);
															return {
																...prev,
																contactIds,
																pocContactId: resolvePocContactId(contactIds),
																receiveEmailContactIds:
																	prev.receiveEmailContactIds.filter((id) =>
																		contactIds.includes(id),
																	),
															};
														});
													}}
													disabled={saving}
												>
													<Trash2 size={14} />
												</ActionIcon>
											</div>
										);
									})}
								</Stack>
							) : null}
						</TaskFormSection>

						<TaskFormSection
							title='Destination'
							action={
								<Button
									size='compact-sm'
									variant='subtle'
									leftSection={<Plus size={14} />}
									onClick={openNewAddress}
									disabled={saving}
								>
									New address
								</Button>
							}
						>
							<Autocomplete
								size={inputSize}
								data={addressOptions.map(({ value, label }) => ({
									value,
									label,
								}))}
								value={form.destinationAddressName}
								onChange={(name) => {
									addressDropdown.onSearchChange(name);
									setForm((prev) => {
										const linked =
											prev.destinationAddressId != null
												? addressOptions.find(
														(a) =>
															a.value === String(prev.destinationAddressId),
													)
												: undefined;
										return {
											...prev,
											destinationAddressName: name,
											// Keep link when Autocomplete echoes the selected label after pick.
											destinationAddressId:
												linked?.label === name
													? prev.destinationAddressId
													: null,
										};
									});
								}}
								onOptionSubmit={(value) => {
									addressDropdown.suppressNextSearchOpen();
									const selected = addressOptions.find(
										(a) => a.value === value,
									);
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
								ref={destinationNotesRef}
								size={inputSize}
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
						</TaskFormSection>
					</div>

					<div className='task-form-col'>
						<TaskFormSection title='Schedule'>
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
							<SimpleGrid cols={{ base: 1, sm: 3 }} spacing={6}>
								<Switch
									label='Can start early'
									checked={form.canStartEarly}
									onChange={(e) =>
										update('canStartEarly', e.currentTarget.checked)
									}
									disabled={saving}
									styles={switchAlignStyles}
								/>
								<Switch
									label='Time specific'
									checked={form.isTimeSpecific}
									onChange={(e) =>
										update('isTimeSpecific', e.currentTarget.checked)
									}
									disabled={saving}
									styles={switchAlignStyles}
								/>
								<Switch
									label='Urgent'
									checked={form.isUrgent}
									onChange={(e) => update('isUrgent', e.currentTarget.checked)}
									disabled={saving}
									styles={switchAlignStyles}
								/>
							</SimpleGrid>
						</TaskFormSection>

						<TaskFormSection title=' '>
							<MultiSelect
								size={inputSize}
								label='Assign To'
								data={crewOptions}
								value={form.crewMemberIds}
								onChange={setCrewMemberIds}
								onKeyDown={singleMatchEnter(crewEnterMatch, (userId) => {
									crewDropdown.clearSearch();
									setCrewMemberIds([...form.crewMemberIds, userId]);
								})}
								renderOption={renderOptionWithEnterHint(crewEnterMatch)}
								placeholder={
									form.crewMemberIds.length === 0
										? 'Crew not assigned'
										: undefined
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
								searchValue={crewDropdown.search}
								onSearchChange={crewDropdown.onSearchChange}
								nothingFoundMessage={
									crewLoading ? 'Loading…' : 'No crew members found'
								}
								disabled={saving}
							/>
							{form.crewMemberIds.length > 0 ? (
								<Stack gap={6} className='task-form-crew'>
									{form.crewMemberIds.map((userId, index) => {
										const option = crewOptions.find((o) => o.value === userId);
										const label = option?.label ?? userId;
										const isLead = index === 0;
										return (
											<div
												key={userId}
												className={
													isLead
														? 'task-form-crew-member task-form-crew-member--lead'
														: 'task-form-crew-member'
												}
											>
												<div className='task-form-crew-member-info'>
													<span className='task-form-crew-member-name'>
														{label}
													</span>
													<span className='task-form-crew-member-role'>
														{isLead ? 'Lead' : 'Sub'}
													</span>
												</div>
												<ActionIcon
													variant='subtle'
													color='gray'
													size='sm'
													aria-label={`Remove ${label}`}
													onClick={() => {
														setForm((prev) => {
															const crewMemberIds = prev.crewMemberIds.filter(
																(id) => id !== userId,
															);
															return {
																...prev,
																crewMemberIds,
																leadCrewMemberId:
																	resolveLeadCrewMemberId(crewMemberIds),
															};
														});
													}}
													disabled={saving}
												>
													<Trash2 size={14} />
												</ActionIcon>
											</div>
										);
									})}
								</Stack>
							) : null}
							{taskTypeUsesEquipment(form.taskType) ? (
								<MultiSelect
									size={inputSize}
									label='Equipment'
									data={[...EQUIPMENT_OPTIONS]}
									value={form.equipment}
									onChange={(v) => update('equipment', v)}
									onKeyDown={singleMatchEnter(equipmentEnterMatch, (item) => {
										setEquipmentSearch('');
										update('equipment', [...form.equipment, item]);
									})}
									renderOption={renderOptionWithEnterHint(equipmentEnterMatch)}
									placeholder={form.equipment.length === 0 ? 'None' : undefined}
									leftSection={<HardHat size={16} />}
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
									searchValue={equipmentSearch}
									onSearchChange={setEquipmentSearch}
									nothingFoundMessage='No equipment found'
									disabled={saving}
								/>
							) : null}

							<SimpleGrid cols={2} spacing={6}>
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
						</TaskFormSection>

						<TaskFormSection title='Attachments'>
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
						</TaskFormSection>
					</div>
				</div>
			</div>

			<Group
				justify='flex-end'
				gap={6}
				wrap='wrap'
				className='task-form-footer'
			>
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
