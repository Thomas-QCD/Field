import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
	Alert,
	Box,
	Button,
	SegmentedControl,
	Text,
	Textarea,
	UnstyledButton,
} from '@mantine/core';
import { ChevronLeft } from 'lucide-react';
import { createCrewEvent, type CrewEventOutcome } from '../api/tasks';
import { captureRequiredGeo } from '../captureGeo';
import { useCurrentUser } from '../context/CurrentUserContext';
import { useAndroidBackHandler } from '../hooks/useAndroidBackHandler';

export function CompleteTaskPage() {
	const { taskId: taskIdParam } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { user } = useCurrentUser();
	const taskId = Number(taskIdParam);

	const [outcome, setOutcome] = useState<CrewEventOutcome>('Completed');
	const [notes, setNotes] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const goBack = () => {
		if (location.key === 'default') {
			navigate(
				Number.isFinite(taskId) && taskId > 0 ? `/task/${taskId}` : '/my-tasks',
			);
			return;
		}
		navigate(-1);
	};

	useAndroidBackHandler(goBack, true);

	const saveLabel =
		outcome === 'Failed' ? 'Save failed task' : 'Save completed task';
	const notesLabel = outcome === 'Failed' ? 'Failed reason' : 'Completed notes';
	const headerTitle = outcome === 'Failed' ? 'Fail Task' : 'Complete Task';
	const emailDisclaimer =
		outcome === 'Failed'
			? 'Marking this task as failed will send email(s) to the contacts.'
			: 'Marking this task as completed will send email(s) to the contacts.';

	const handleSave = async () => {
		if (busy) return;
		if (!Number.isFinite(taskId) || taskId <= 0) {
			setError('Invalid task id');
			return;
		}
		if (!user) {
			setError('Select a user before ending a task');
			return;
		}
		if (outcome === 'Failed' && notes.length === 0) {
			setError('Failed reason is required');
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const geo = await captureRequiredGeo();
			await createCrewEvent(taskId, {
				userId: user.id,
				eventType: 'ended',
				outcome,
				notes,
				latitude: geo.latitude,
				longitude: geo.longitude,
				accuracyMeters: geo.accuracyMeters,
				recordedAt: geo.recordedAt,
			});
			navigate(`/task/${taskId}`, { replace: true });
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Failed to end task');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Box className='task-view-page complete-task-page'>
			<header className='task-view-header'>
				<UnstyledButton
					onClick={goBack}
					aria-label='Back'
					className='task-view-back'
					disabled={busy}
				>
					<ChevronLeft size={28} strokeWidth={2} aria-hidden />
				</UnstyledButton>
				<Text fw={700} fz='lg' lineClamp={1} className='task-view-title'>
					{headerTitle}
				</Text>
				<span className='task-view-type' aria-hidden />
			</header>

			<div className='complete-task-body'>
				<label className='complete-task-label' htmlFor='complete-task-outcome'>
					Outcome
				</label>
				<SegmentedControl
					id='complete-task-outcome'
					fullWidth
					value={outcome}
					onChange={(value) => setOutcome(value as CrewEventOutcome)}
					data={[
						{ label: 'Completed', value: 'Completed' },
						{ label: 'Failed', value: 'Failed' },
					]}
					disabled={busy}
				/>

				<label className='complete-task-label' htmlFor='complete-task-notes'>
					{notesLabel}
				</label>
				<Textarea
					id='complete-task-notes'
					value={notes}
					onChange={(e) => setNotes(e.currentTarget.value)}
					minRows={6}
					autosize
					disabled={busy}
					classNames={{ input: 'complete-task-notes-input' }}
				/>

				{error ? (
					<Alert color='red' title='Could not save'>
						{error}
					</Alert>
				) : null}
			</div>

			<div className='complete-task-footer'>
				<Text size='xs' c='dimmed' ta='center' mb='sm'>
					{emailDisclaimer}
				</Text>
				<Button
					fullWidth
					size='md'
					color={outcome === 'Failed' ? 'red' : 'brand'}
					loading={busy}
					disabled={outcome === 'Failed' && notes.length === 0}
					onClick={() => void handleSave()}
				>
					{saveLabel}
				</Button>
			</div>
		</Box>
	);
}
