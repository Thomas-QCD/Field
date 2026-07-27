import { useEffect, useState } from 'react';
import {
	Alert,
	Button,
	Center,
	Image,
	Loader,
	Stack,
	Text,
} from '@mantine/core';
import QRCode from 'qrcode';
import {
	issueMobileActivation,
	type AppUser,
	type MobileActivation,
} from '../api/users';
import { KeyboardAwareModal } from './KeyboardAwareModal';
import { useCurrentUser } from '../context/CurrentUserContext';

type IssueActivationQrModalProps = {
	user: AppUser | null;
	opened: boolean;
	onClose: () => void;
};

function formatExpiresAt(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	});
}

export function IssueActivationQrModal({
	user,
	opened,
	onClose,
}: IssueActivationQrModalProps) {
	const { user: currentUser, entraMode } = useCurrentUser();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activation, setActivation] = useState<MobileActivation | null>(null);
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!opened || !user) {
			setActivation(null);
			setQrDataUrl(null);
			setError(null);
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setActivation(null);
		setQrDataUrl(null);

		void issueMobileActivation(user.id, {
			createdByUserId: entraMode ? undefined : (currentUser?.id ?? undefined),
			signal: controller.signal,
		})
			.then(async (result) => {
				if (controller.signal.aborted) return;
				setActivation(result);
				const dataUrl = await QRCode.toDataURL(result.code, {
					errorCorrectionLevel: 'M',
					margin: 2,
					width: 280,
				});
				if (!controller.signal.aborted) setQrDataUrl(dataUrl);
			})
			.catch((err: unknown) => {
				if (
					(err instanceof DOMException || err instanceof Error) &&
					err.name === 'AbortError'
				) {
					return;
				}
				setError(
					err instanceof Error ? err.message : 'Failed to issue activation QR',
				);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});

		return () => controller.abort();
	}, [opened, user, currentUser?.id, entraMode]);

	return (
		<KeyboardAwareModal
			opened={opened}
			onClose={onClose}
			title={user ? `Activate ${user.displayName}` : 'Activation QR'}
			centered
		>
			{loading ? (
				<Center py='xl'>
					<Loader size='sm' />
				</Center>
			) : null}

			{error ? (
				<Alert color='red' title='Could not issue QR' mb='md'>
					{error}
				</Alert>
			) : null}

			{activation && qrDataUrl ? (
				<Stack align='center' gap='sm'>
					<Image
						src={qrDataUrl}
						alt='Mobile activation QR code'
						w={280}
						h={280}
						fit='contain'
					/>
					<Text size='sm' c='dimmed' ta='center'>
						Single-use code. Expires {formatExpiresAt(activation.expiresAt)}.
						Show this QR once — it cannot be retrieved again.
					</Text>
					<Text
						size='xs'
						ff='monospace'
						c='dimmed'
						ta='center'
						style={{ wordBreak: 'break-all' }}
					>
						{activation.code}
					</Text>
					<Button onClick={onClose} color='brand' fullWidth mt='sm'>
						Done
					</Button>
				</Stack>
			) : null}
		</KeyboardAwareModal>
	);
}
