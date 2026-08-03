import { useEffect, useState, Fragment, type ReactNode } from 'react';
import {
	Stack,
	Group,
	Text,
	Loader,
	Alert,
	Button,
	Badge,
	Divider,
	Anchor,
	Title,
	Menu,
	Textarea,
} from '@mantine/core';
import {
	Ellipsis,
	FileText,
	Pencil,
	Printer,
	RefreshCw,
	Ban,
} from 'lucide-react';
import { getTask, openDeliveryDocket, updateTaskStatus } from '../api/tasks';
import { useCurrentUser } from '../context/CurrentUserContext';
import { formatShortName } from '../formatName';
import { formatTimeAgo } from '../formatTime';
import { isEmptyTaskDesc } from '../taskDescHtml';
import type { TaskDetail, TaskStatus } from '../types/task';
import { statusTransitionsFor } from '../../shared/statusTransitions.js';
import { KeyboardAwareModal } from './KeyboardAwareModal';
import { TaskDescHtml } from './TaskDescHtml';
import { TaskAttachments } from './TaskAttachments';
import { TaskHistory } from './TaskHistory';
import { TaskStartedCrew } from './TaskStartedCrew';
import { TaskStatusBadge } from './TaskStatusBadge';

interface TaskDetailModalProps {
	taskId: number | null;
	opened: boolean;
	onClose: () => void;
	onEdit?: (task: TaskDetail) => void;
	onDelete?: (task: TaskDetail) => Promise<void>;
	onRestore?: (task: TaskDetail) => Promise<void>;
	onStatusChange?: (task: { id: number; status: TaskStatus }) => void;
}

function formatDateTime(value: string | null): string {
	if (!value) return '—';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

function formatDuration(
	startIso: string | null,
	endIso: string | null,
): string {
	if (!startIso || !endIso) return '—';
	const start = new Date(startIso);
	const end = new Date(endIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
	const ms = end.getTime() - start.getTime();
	if (ms < 0) return '—';

	const totalMinutes = Math.round(ms / 60_000);
	if (totalMinutes === 0) return '0m';

	const days = Math.floor(totalMinutes / (60 * 24));
	const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
	const minutes = totalMinutes % 60;
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
	return parts.join(' ');
}

function formatDateTimeWithAgo(value: string | null): string {
	const absolute = formatDateTime(value);
	if (absolute === '—') return absolute;
	const ago = formatTimeAgo(value);
	return ago ? `${absolute} (${ago})` : absolute;
}

function DetailField({ label, value }: { label: string; value: string }) {
	return (
		<>
			<dt className='task-detail-field-key'>{label}</dt>
			<dd className='task-detail-field-value'>{value || '—'}</dd>
		</>
	);
}

function DetailFields({ children }: { children: ReactNode }) {
	return <dl className='task-detail-fields'>{children}</dl>;
}

function Section({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<Stack gap='sm' className={className}>
			<Divider
				label={
					<Text size='xs' fw={700} tt='uppercase' c='dimmed'>
						{label}
					</Text>
				}
				labelPosition='left'
			/>
			{children}
		</Stack>
	);
}

export function TaskDetailModal({
	taskId,
	opened,
	onClose,
	onEdit,
	onDelete,
	onRestore,
	onStatusChange,
}: TaskDetailModalProps) {
	const { user } = useCurrentUser();
	const [task, setTask] = useState<TaskDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [actionBusy, setActionBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionNotice, setActionNotice] = useState<string | null>(null);
	const [pendingOutcome, setPendingOutcome] = useState<
		'Completed' | 'Failed' | null
	>(null);
	const [statusNotes, setStatusNotes] = useState('');

	useEffect(() => {
		if (!opened || taskId == null) {
			setTask(null);
			setError(null);
			setLoading(false);
			setActionBusy(false);
			setActionError(null);
			setActionNotice(null);
			setPendingOutcome(null);
			setStatusNotes('');
			return;
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setActionError(null);
		setActionNotice(null);
		setPendingOutcome(null);
		setStatusNotes('');
		setTask(null);

		getTask(taskId, controller.signal)
			.then((next) => {
				if (!controller.signal.aborted) setTask(next);
			})
			.catch((err: unknown) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : 'Failed to load task');
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [opened, taskId]);

	const handlePrintUnavailable = (label: string) => {
		setActionError(null);
		setActionNotice(`${label} is not available yet.`);
	};

	const handlePrintDeliveryDocket = async () => {
		if (!task || actionBusy) return;
		setActionBusy(true);
		setActionError(null);
		setActionNotice(null);
		try {
			await openDeliveryDocket(task.id);
		} catch (err: unknown) {
			setActionError(
				err instanceof Error ? err.message : 'Failed to open delivery docket',
			);
		} finally {
			setActionBusy(false);
		}
	};

	const handleStatusChange = async (status: TaskStatus) => {
		if (!task || actionBusy) return;

		if (status === 'Completed' || status === 'Failed') {
			setActionError(null);
			setActionNotice(null);
			setPendingOutcome(status);
			setStatusNotes(
				status === 'Failed'
					? (task.failedReason ?? '')
					: (task.completedNotes ?? ''),
			);
			return;
		}

		setActionBusy(true);
		setActionError(null);
		setActionNotice(null);
		setPendingOutcome(null);
		try {
			const updated = await updateTaskStatus(task.id, status);
			setTask((prev) =>
				prev
					? {
							...prev,
							status: updated.status,
							completedAt: updated.completedAt,
							completedNotes: updated.completedNotes,
							failedReason: updated.failedReason,
							completionNotes: updated.completionNotes,
							completionNotesByName: updated.completionNotesByName,
						}
					: prev,
			);
			onStatusChange?.(updated);
		} catch (err: unknown) {
			setActionError(
				err instanceof Error ? err.message : 'Failed to change status',
			);
		} finally {
			setActionBusy(false);
		}
	};

	const handleSaveOutcome = async () => {
		if (!task || !pendingOutcome || actionBusy) return;
		setActionBusy(true);
		setActionError(null);
		setActionNotice(null);
		try {
			const updated = await updateTaskStatus(task.id, pendingOutcome, {
				notes: statusNotes.trim(),
				userId: user?.id,
			});
			setTask((prev) =>
				prev
					? {
							...prev,
							status: updated.status,
							completedAt: updated.completedAt,
							completedNotes: updated.completedNotes,
							failedReason: updated.failedReason,
							completionNotes: updated.completionNotes,
							completionNotesByName: updated.completionNotesByName,
						}
					: prev,
			);
			onStatusChange?.(updated);
			setPendingOutcome(null);
			setStatusNotes('');
		} catch (err: unknown) {
			setActionError(
				err instanceof Error ? err.message : 'Failed to change status',
			);
		} finally {
			setActionBusy(false);
		}
	};

	const handleDelete = async () => {
		if (!task || !onDelete) return;
		const label = task.externalKey
			? `#${task.externalKey}`
			: `task #${task.id}`;
		if (!window.confirm(`Cancel ${label}?`)) {
			return;
		}
		setActionBusy(true);
		setActionError(null);
		setActionNotice(null);
		try {
			await onDelete(task);
		} catch (err: unknown) {
			setActionError(
				err instanceof Error ? err.message : 'Failed to cancel task',
			);
			setActionBusy(false);
		}
	};

	const handleRestore = async () => {
		if (!task || !onRestore) return;
		setActionBusy(true);
		setActionError(null);
		setActionNotice(null);
		try {
			await onRestore(task);
		} catch (err: unknown) {
			setActionError(
				err instanceof Error ? err.message : 'Failed to restore task',
			);
			setActionBusy(false);
		}
	};

	const statusOptions: TaskStatus[] = task
		? ((statusTransitionsFor(task.taskType)[task.status] ??
				[]) as TaskStatus[])
		: [];

	const title =
		task?.externalKey != null && task.externalKey !== ''
			? `#${task.externalKey}`
			: taskId != null
				? `#${taskId}`
				: 'Task';

	const completedNoteEntries =
		task?.completionNotes?.filter((n) => n.outcome === 'Completed') ?? [];
	const failedNoteEntries =
		task?.completionNotes?.filter((n) => n.outcome === 'Failed') ?? [];
	const hasLegacyCompleted =
		Boolean(task?.completedNotes?.trim()) && completedNoteEntries.length === 0;
	const hasLegacyFailed =
		Boolean(task?.failedReason?.trim()) && failedNoteEntries.length === 0;
	const showCompletionCallout =
		Boolean(task) &&
		(pendingOutcome != null ||
			completedNoteEntries.length > 0 ||
			failedNoteEntries.length > 0 ||
			hasLegacyCompleted ||
			hasLegacyFailed);

	const renderNoteEntries = (
		entries: NonNullable<TaskDetail['completionNotes']>,
		outcome: 'Completed' | 'Failed',
	) => (
		<div className='task-detail-completion-list'>
			{entries.map((entry) => {
				const when = formatDateTime(entry.updatedAt || entry.createdAt);
				const who = formatShortName(entry.displayName);
				return (
					<div key={entry.userId} className='task-detail-completion-entry'>
						{entry.notes?.trim() ? (
							<p className='task-detail-completion-notes'>
								{entry.notes.trim()}
							</p>
						) : null}
						<p className='task-detail-completion-meta'>
							{outcome} at {when} by {who}
						</p>
					</div>
				);
			})}
		</div>
	);

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={onClose}
			pinFooter
			title={
				task ? (
					<Group gap='sm' wrap='nowrap'>
						<Title order={3} fz={24}>
							{title}
						</Title>
						<Badge variant='light' color='brand'>
							{task.taskType}
						</Badge>
						<TaskStatusBadge status={task.status} />
					</Group>
				) : (
					title
				)
			}
			size='1200px'
			centered
			classNames={{
				content: 'task-detail-modal',
				header: 'task-detail-modal-header',
				body: 'task-detail-modal-body',
			}}
			styles={{
				title: { fontWeight: 700 },
				header: { minHeight: 0 },
			}}
		>
			{loading ? (
				<Group justify='center' py='xl'>
					<Loader size='sm' />
				</Group>
			) : error ? (
				<Alert color='red' title='Could not load task'>
					{error}
				</Alert>
			) : task ? (
				<>
					<div className='task-detail-scroll'>
						<Stack gap='lg' className='task-detail-scroll-stack'>
							<div className='task-detail-layout'>
								<div className='task-detail-main'>
									<Stack gap='lg'>
										{task.status === 'Cancelled' && task.cancelledAt ? (
											<Alert color='orange' title='Cancelled'>
												Scheduled for permanent removal on{' '}
												{formatDateTime(
													new Date(
														new Date(task.cancelledAt).getTime() +
															7 * 24 * 60 * 60 * 1000,
													).toISOString(),
												)}
												.
											</Alert>
										) : null}
										{showCompletionCallout ? (
											<Stack gap='sm'>
												{pendingOutcome ? (
													<div
														className={
															pendingOutcome === 'Failed'
																? 'task-detail-completion task-detail-completion--failed'
																: 'task-detail-completion'
														}
													>
														<Stack gap='sm'>
															<Textarea
																label={
																	pendingOutcome === 'Failed'
																		? 'Failed reason'
																		: 'Completed notes'
																}
																value={statusNotes}
																onChange={(e) =>
																	setStatusNotes(e.currentTarget.value)
																}
																minRows={3}
																autosize
																disabled={actionBusy}
															/>
															<Group gap='xs'>
																<Button
																	color={
																		pendingOutcome === 'Failed'
																			? 'red'
																			: 'brand'
																	}
																	loading={actionBusy}
																	onClick={() => void handleSaveOutcome()}
																>
																	{pendingOutcome === 'Failed'
																		? 'Complete'
																		: 'Mark Failed'}
																</Button>
																<Button
																	variant='default'
																	disabled={actionBusy}
																	onClick={() => {
																		setPendingOutcome(null);
																		setStatusNotes('');
																	}}
																>
																	Cancel
																</Button>
															</Group>
														</Stack>
													</div>
												) : null}

												{completedNoteEntries.length > 0 ? (
													<div className='task-detail-completion'>
														{renderNoteEntries(
															completedNoteEntries,
															'Completed',
														)}
													</div>
												) : null}

												{failedNoteEntries.length > 0 ? (
													<div className='task-detail-completion task-detail-completion--failed'>
														{renderNoteEntries(failedNoteEntries, 'Failed')}
													</div>
												) : null}

												{hasLegacyCompleted ? (
													<div className='task-detail-completion'>
														<p className='task-detail-completion-notes'>
															{task.completedNotes!.trim()}
														</p>
														{task.completedAt || task.completionNotesByName ? (
															<p className='task-detail-completion-meta'>
																Completed
																{task.completedAt
																	? ` at ${formatDateTime(task.completedAt)}`
																	: ''}
																{task.completionNotesByName
																	? ` by ${formatShortName(task.completionNotesByName)}`
																	: ''}
															</p>
														) : null}
													</div>
												) : null}

												{hasLegacyFailed ? (
													<div className='task-detail-completion task-detail-completion--failed'>
														<p className='task-detail-completion-notes'>
															{task.failedReason!.trim()}
														</p>
														{task.completionNotesByName ? (
															<p className='task-detail-completion-meta'>
																Failed by{' '}
																{formatShortName(task.completionNotesByName)}
															</p>
														) : null}
													</div>
												) : null}
											</Stack>
										) : null}

										<TaskStartedCrew
											status={task.status}
											crewMembers={task.crewMembers}
										/>

										<DetailFields>
											<DetailField
												label='Created by'
												value={
													task.createdByName
														? formatShortName(task.createdByName)
														: ''
												}
											/>
											{!isEmptyTaskDesc(task.description) ? (
												<>
													<dt className='task-detail-field-key'>
														Description
													</dt>
													<dd className='task-detail-field-value'>
														<TaskDescHtml value={task.description} />
													</dd>
												</>
											) : null}
											<DetailField
												label='Crew'
												value={
													task.crewMembers.length
														? task.crewMembers
																.map((m) => formatShortName(m.displayName))
																.join(', ')
														: 'Unassigned'
												}
											/>
										</DetailFields>

										<Section label='Contacts'>
											{task.contacts.length === 0 ? (
												<Text size='sm' c='dimmed'>
													None
												</Text>
											) : (
												<DetailFields>
													{task.contacts.map((contact) => (
														<Fragment key={contact.id}>
															<dt className='task-detail-field-key'>
																{contact.isPoc ? 'POC' : 'Contact'}
															</dt>
															<dd className='task-detail-field-value'>
																<span className='task-detail-contact-name'>
																	{contact.name}
																</span>
																{contact.title.trim() ? (
																	<span className='task-detail-contact-title'>
																		{contact.title.trim()}
																	</span>
																) : null}
																{(contact.phone || contact.email) && (
																	<span className='task-detail-contact-meta'>
																		{contact.phone ? (
																			<Anchor
																				href={`tel:${contact.phone}`}
																				size='sm'
																				c='dimmed'
																			>
																				{contact.phone}
																			</Anchor>
																		) : null}
																		{contact.phone && contact.email ? (
																			<span aria-hidden> · </span>
																		) : null}
																		{contact.email ? (
																			<Anchor
																				href={`mailto:${contact.email}`}
																				size='sm'
																				c='dimmed'
																			>
																				{contact.email}
																			</Anchor>
																		) : null}
																	</span>
																)}
															</dd>
														</Fragment>
													))}
												</DetailFields>
											)}
										</Section>

										<Section label='Destination'>
											{task.destinationAddressId == null &&
											!task.destinationAddressName &&
											!task.destinationAddress ? (
												<Text size='sm' c='dimmed'>
													None
												</Text>
											) : (
												<DetailFields>
													<DetailField
														label='Name'
														value={task.destinationAddressName}
													/>
													<DetailField
														label='Building'
														value={task.destinationBuilding}
													/>
													<DetailField
														label='Address'
														value={task.destinationAddress}
													/>
													{task.destinationNotes ? (
														<DetailField
															label='Location notes'
															value={task.destinationNotes}
														/>
													) : null}
												</DetailFields>
											)}
										</Section>

										<Section label='Schedule & crew'>
											<DetailFields>
												<DetailField
													label='Window start'
													value={formatDateTime(task.windowStartAt)}
												/>
												<DetailField
													label='Window end'
													value={formatDateTime(task.windowEndAt)}
												/>
												<DetailField
													label='Window duration'
													value={formatDuration(
														task.windowStartAt,
														task.windowEndAt,
													)}
												/>
												<DetailField
													label='Guys'
													value={
														task.crewSize != null ? String(task.crewSize) : ''
													}
												/>
												<DetailField
													label='Hours'
													value={
														task.estimatedHours != null
															? String(task.estimatedHours)
															: ''
													}
												/>
												<DetailField
													label='Time specific'
													value={task.isTimeSpecific ? 'Yes' : 'No'}
												/>
												<DetailField
													label='Can start early'
													value={task.canStartEarly ? 'Yes' : 'No'}
												/>
											</DetailFields>
										</Section>
									</Stack>
								</div>

								<aside className='task-detail-attachments'>
									<div className='task-detail-attachments-section'>
										<TaskAttachments
											taskId={task.id}
											initialAttachments={task.attachments}
											variant='plain'
										/>
									</div>
									<TaskHistory
										taskId={task.id}
										refreshKey={`${task.status}:${task.updatedAt}`}
									/>
								</aside>
							</div>

							<Text>
								Created {formatDateTimeWithAgo(task.createdAt)}
								{<br />}
								Updated {formatDateTimeWithAgo(task.updatedAt)}
							</Text>
						</Stack>
					</div>

					<div className='task-detail-footer'>
						{actionNotice ? (
							<Alert color='yellow' title='Unavailable' mb='sm'>
								{actionNotice}
							</Alert>
						) : null}

						{actionError ? (
							<Alert color='red' title='Action failed' mb='sm'>
								{actionError}
							</Alert>
						) : null}

						<Group justify='space-between' gap='xs' wrap='nowrap'>
							<Button variant='default' onClick={onClose} disabled={actionBusy}>
								Close
							</Button>
							<Group gap='xs' wrap='nowrap'>
								{onEdit ? (
									<Button
										color='brand'
										leftSection={<Pencil size={16} />}
										onClick={() => onEdit(task)}
										disabled={actionBusy}
									>
										Edit
									</Button>
								) : null}
								<Menu shadow='md' width={220} position='top-end'>
									<Menu.Target>
										<Button
											variant='default'
											leftSection={<Ellipsis size={16} />}
											loading={actionBusy}
											disabled={actionBusy}
										>
											More actions
										</Button>
									</Menu.Target>
									<Menu.Dropdown>
										<Menu.Item
											leftSection={<Printer size={16} />}
											onClick={() => handlePrintUnavailable('Print task')}
										>
											Print task
										</Menu.Item>
										<Menu.Item
											leftSection={<FileText size={16} />}
											onClick={() => void handlePrintDeliveryDocket()}
										>
											Print delivery docket
										</Menu.Item>
										<Menu.Sub>
											<Menu.Sub.Target>
												<Menu.Sub.Item
													leftSection={<RefreshCw size={16} />}
													disabled={statusOptions.length === 0}
												>
													Change status
												</Menu.Sub.Item>
											</Menu.Sub.Target>
											<Menu.Sub.Dropdown>
												{statusOptions.map((status) => (
													<Menu.Item
														key={status}
														onClick={() => void handleStatusChange(status)}
													>
														{status}
													</Menu.Item>
												))}
											</Menu.Sub.Dropdown>
										</Menu.Sub>
										{task.status === 'Cancelled' ? (
											onRestore ? (
												<>
													<Menu.Divider />
													<Menu.Item
														leftSection={<RefreshCw size={16} />}
														onClick={() => void handleRestore()}
													>
														Restore task
													</Menu.Item>
												</>
											) : null
										) : onDelete ? (
											<>
												<Menu.Divider />
												<Menu.Item
													color='red'
													leftSection={<Ban size={16} />}
													onClick={() => void handleDelete()}
												>
													Cancel task
												</Menu.Item>
											</>
										) : null}
									</Menu.Dropdown>
								</Menu>
							</Group>
						</Group>
					</div>
				</>
			) : null}
		</KeyboardAwareModal>
	);
}
