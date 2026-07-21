import { useEffect, useState, type ReactNode } from 'react';
import {
	Stack,
	Group,
	Text,
	SimpleGrid,
	Loader,
	Alert,
	Button,
	Box,
	Badge,
	Divider,
	Anchor,
	Title,
} from '@mantine/core';
import { Pencil, Trash2 } from 'lucide-react';
import { getTask } from '../api/tasks';
import { formatShortName } from '../formatName';
import type { TaskDetail, TaskStatus } from '../types/task';
import { KeyboardAwareModal } from './KeyboardAwareModal';

interface TaskDetailModalProps {
	taskId: number | null;
	opened: boolean;
	onClose: () => void;
	onEdit?: (task: TaskDetail) => void;
	onDelete?: (task: TaskDetail) => Promise<void>;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
	Created: 'gray',
	Unassigned: 'yellow',
	Assigned: 'blue',
	Loaded: 'cyan',
	Arrived: 'indigo',
	Completed: 'green',
	Failed: 'red',
	Cancelled: 'gray',
};

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

function formatTimeAgo(value: string | null): string | null {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;

	const seconds = Math.round((Date.now() - d.getTime()) / 1000);
	const future = seconds < 0;
	const abs = Math.abs(seconds);

	let label: string;
	if (abs < 45) label = 'just now';
	else if (abs < 90) label = '1 minute';
	else if (abs < 45 * 60) label = `${Math.round(abs / 60)} minutes`;
	else if (abs < 90 * 60) label = '1 hour';
	else if (abs < 22 * 60 * 60) label = `${Math.round(abs / 3600)} hours`;
	else if (abs < 36 * 60 * 60) label = '1 day';
	else if (abs < 26 * 24 * 60 * 60) label = `${Math.round(abs / 86400)} days`;
	else if (abs < 46 * 24 * 60 * 60) label = '1 month';
	else if (abs < 320 * 24 * 60 * 60)
		label = `${Math.round(abs / (30 * 86400))} months`;
	else if (abs < 548 * 24 * 60 * 60) label = '1 year';
	else label = `${Math.round(abs / (365 * 86400))} years`;

	if (label === 'just now') return label;
	return future ? `in ${label}` : `${label} ago`;
}

function formatDateTimeWithAgo(value: string | null): string {
	const absolute = formatDateTime(value);
	if (absolute === '—') return absolute;
	const ago = formatTimeAgo(value);
	return ago ? `${absolute} (${ago})` : absolute;
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
			<Text size='xs' c='dimmed' fw={600} tt='uppercase' mb={2}>
				{label}
			</Text>
			<Text
				size='sm'
				style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
			>
				{value || '—'}
			</Text>
		</Box>
	);
}

function Section({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Stack gap='sm'>
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
}: TaskDetailModalProps) {
	const [task, setTask] = useState<TaskDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	useEffect(() => {
		if (!opened || taskId == null) {
			setTask(null);
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

	const handleDelete = async () => {
		if (!task || !onDelete) return;
		const label = task.externalKey ? `#${task.externalKey}` : `task #${task.id}`;
		if (!window.confirm(`Delete ${label}?`)) return;
		setDeleting(true);
		setDeleteError(null);
		try {
			await onDelete(task);
		} catch (err: unknown) {
			setDeleteError(
				err instanceof Error ? err.message : 'Failed to delete task',
			);
			setDeleting(false);
		}
	};

	const title =
		task?.externalKey != null && task.externalKey !== ''
			? `#${task.externalKey}`
			: taskId != null
				? `#${taskId}`
				: 'Task';

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={onClose}
			title={
				task ? (
					<Group gap='sm' wrap='nowrap'>
						<Title order={3} fz={24}>
							{title}
						</Title>
						<Badge variant='light' color='brand'>
							{task.taskType}
						</Badge>
						<Badge variant='light' color={STATUS_COLOR[task.status]}>
							{task.status}
						</Badge>
					</Group>
				) : (
					title
				)
			}
			size='lg'
			centered
			styles={{
				title: { fontWeight: 700 },
				body: { paddingTop: 8 },
				header: { minHeight: 0, paddingBottom: 8 },
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
				<Stack gap='lg'>
					<SimpleGrid cols={1} spacing='sm'>
						<DetailField label='Created by' value={task.createdByName} />
						{task.description ? (
							<DetailField
								label='Description'
								value={task.description}
								span={2}
							/>
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
					</SimpleGrid>

					<Section label='Contacts'>
						{task.contacts.length === 0 ? (
							<Text size='sm' c='dimmed'>
								None
							</Text>
						) : (
							<Stack gap='sm'>
								{task.contacts.map((contact) => (
									<Box key={contact.id}>
										<Text size='sm' fw={600}>
											{formatShortName(contact.name)}
										</Text>
										{(contact.phone || contact.email) && (
											<Group gap='md' mt={2}>
												{contact.phone ? (
													<Anchor
														href={`tel:${contact.phone}`}
														size='sm'
														c='dimmed'
													>
														{contact.phone}
													</Anchor>
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
											</Group>
										)}
									</Box>
								))}
							</Stack>
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
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing='sm'>
								<DetailField label='Name' value={task.destinationAddressName} />
								<DetailField
									label='Building'
									value={task.destinationBuilding}
								/>
								<DetailField
									label='Address'
									value={task.destinationAddress}
									span={2}
								/>
								{task.destinationNotes ? (
									<DetailField
										label='Location notes'
										value={task.destinationNotes}
										span={2}
									/>
								) : null}
							</SimpleGrid>
						)}
					</Section>

					<Section label='Schedule & crew'>
						<SimpleGrid cols={3} spacing='sm'>
							<DetailField
								label='Window start'
								value={formatDateTime(task.windowStartAt)}
							/>
							<DetailField
								label='Window end'
								value={formatDateTime(task.windowEndAt)}
							/>
							<DetailField
								label='Window Duration'
								value={formatDuration(task.windowStartAt, task.windowEndAt)}
							/>
						</SimpleGrid>
						<SimpleGrid cols={4} spacing='sm'>
							<DetailField
								label='Guys'
								value={task.crewSize != null ? String(task.crewSize) : ''}
							/>
							<DetailField
								label='Hours'
								value={
									task.estimatedHours != null ? String(task.estimatedHours) : ''
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
						</SimpleGrid>
					</Section>

					{(task.completedAt || task.completedNotes || task.failedReason) && (
						<Section label='Completion'>
							<SimpleGrid cols={{ base: 1, sm: 2 }} spacing='sm'>
								<DetailField
									label='Completed at'
									value={formatDateTime(task.completedAt)}
								/>
								<DetailField
									label='Failed reason'
									value={task.failedReason ?? ''}
								/>
								{task.completedNotes ? (
									<DetailField
										label='Completed notes'
										value={task.completedNotes}
										span={2}
									/>
								) : null}
							</SimpleGrid>
						</Section>
					)}

					<Text>
						Created {formatDateTimeWithAgo(task.createdAt)}
						{<br />}
						Updated {formatDateTimeWithAgo(task.updatedAt)}
					</Text>

					{deleteError ? (
						<Alert color='red' title='Could not delete task'>
							{deleteError}
						</Alert>
					) : null}

					<Group justify='space-between' gap='xs' wrap='nowrap'>
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
						<Group gap='xs' wrap='nowrap'>
							<Button variant='default' onClick={onClose} disabled={deleting}>
								Close
							</Button>
							{onEdit ? (
								<Button
									color='brand'
									leftSection={<Pencil size={16} />}
									onClick={() => onEdit(task)}
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
