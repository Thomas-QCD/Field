import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import { cloneTask } from '../api/tasks';
import { useCurrentUser } from '../context/CurrentUserContext';
import { KeyboardAwareModal } from './KeyboardAwareModal';

export type CloneTaskModalProps = {
	taskId: number | null;
	opened: boolean;
	onClose: () => void;
	onCloned: (newTaskId: number) => void | Promise<void>;
};

type CloneOptionsState = {
	includeContacts: boolean;
	includeCrew: boolean;
	includeDates: boolean;
	includeAttachments: boolean;
	includeExternalKey: boolean;
};

const DEFAULT_OPTIONS: CloneOptionsState = {
	includeContacts: true,
	includeCrew: true,
	includeDates: true,
	includeAttachments: true,
	includeExternalKey: false,
};

export function CloneTaskModal({
	taskId,
	opened,
	onClose,
	onCloned,
}: CloneTaskModalProps) {
	const { user } = useCurrentUser();
	const [options, setOptions] = useState<CloneOptionsState>(DEFAULT_OPTIONS);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!opened) return;
		setOptions(DEFAULT_OPTIONS);
		setBusy(false);
		setError(null);
	}, [opened, taskId]);

	const handleClone = async () => {
		if (taskId == null || busy) return;
		if (!user) {
			setError('Select a user in the sidebar before cloning a task');
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const created = await cloneTask(taskId, {
				createdByUserId: user.id,
				...options,
			});
			await onCloned(created.id);
			onClose();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Clone task failed');
		} finally {
			setBusy(false);
		}
	};

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={() => {
				if (!busy) onClose();
			}}
			title={taskId != null ? `Clone task #${taskId}` : 'Clone task'}
			size='sm'
			centered
			closeOnClickOutside={!busy}
			closeOnEscape={!busy}
		>
			<Stack gap='md'>
				<Text size='sm' c='dimmed'>
					Choose what to copy onto the new task. Type, title, description,
					destination, equipment, and flags are always included.
				</Text>

				{error ? (
					<Alert color='red' variant='light'>
						{error}
					</Alert>
				) : null}

				<Stack gap='xs'>
					<Checkbox
						label='Contacts'
						checked={options.includeContacts}
						disabled={busy}
						onChange={(e) =>
							setOptions((prev) => ({
								...prev,
								includeContacts: e.currentTarget.checked,
							}))
						}
					/>
					<Checkbox
						label='Crew'
						checked={options.includeCrew}
						disabled={busy}
						onChange={(e) =>
							setOptions((prev) => ({
								...prev,
								includeCrew: e.currentTarget.checked,
							}))
						}
					/>
					<Checkbox
						label='Dates'
						checked={options.includeDates}
						disabled={busy}
						onChange={(e) =>
							setOptions((prev) => ({
								...prev,
								includeDates: e.currentTarget.checked,
							}))
						}
					/>
					<Checkbox
						label='Attachments'
						checked={options.includeAttachments}
						disabled={busy}
						onChange={(e) =>
							setOptions((prev) => ({
								...prev,
								includeAttachments: e.currentTarget.checked,
							}))
						}
					/>
					<Checkbox
						label='External key'
						checked={options.includeExternalKey}
						disabled={busy}
						onChange={(e) =>
							setOptions((prev) => ({
								...prev,
								includeExternalKey: e.currentTarget.checked,
							}))
						}
					/>
				</Stack>

				<Group justify='flex-end' gap='sm'>
					<Button variant='default' onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={() => void handleClone()} loading={busy}>
						Clone
					</Button>
				</Group>
			</Stack>
		</KeyboardAwareModal>
	);
}
