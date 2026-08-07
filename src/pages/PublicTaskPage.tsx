import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
	Alert,
	Anchor,
	Box,
	Button,
	Center,
	Loader,
	Stack,
	Text,
	Title,
} from '@mantine/core';
import { Download } from 'lucide-react';
import { apiUrl } from '../api/client';
import { useDocumentTitle } from '../documentTitle';
import { formatTimeAgo } from '../formatTime';

export interface PublicTaskDocument {
	kind: string;
	fileName: string;
	available: boolean;
}

export interface PublicTaskHistoryEvent {
	id: string;
	type: string;
	at: string | null;
	title: string;
	fromStatus: string | null;
	toStatus: string | null;
	detail: string | null;
}

export interface PublicTaskPayload {
	jobTitle: string;
	status: string;
	taskType: string;
	headline: string;
	destinationName: string;
	destinationLabel: string;
	completedAt: string | null;
	documents: PublicTaskDocument[];
	history: PublicTaskHistoryEvent[];
	trackingPath: string;
	trackingUrl: string;
}

function formatWhen(value: string | null): string {
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

function formatWhenWithAgo(value: string | null): string {
	const absolute = formatWhen(value);
	if (absolute === '—') return absolute;
	const ago = formatTimeAgo(value);
	return ago ? `${absolute} (${ago})` : absolute;
}

function docLabel(kind: string): string {
	if (kind === 'proof_of_completion' || kind === 'pod') return 'Proof of Completion';
	if (kind === 'delivery_docket') return 'Delivery Docket';
	return kind.replace(/_/g, ' ');
}

async function fetchPublicTask(
	token: string,
	signal?: AbortSignal,
): Promise<PublicTaskPayload> {
	const res = await fetch(apiUrl(`/api/public/tasks/${encodeURIComponent(token)}`), {
		signal,
	});
	if (res.status === 404) {
		throw Object.assign(new Error('Order not found'), { status: 404 });
	}
	if (!res.ok) {
		let message = `Request failed (${res.status})`;
		try {
			const data = (await res.json()) as { error?: string };
			if (data.error) message = data.error;
		} catch {
			/* ignore */
		}
		throw new Error(message);
	}
	return (await res.json()) as PublicTaskPayload;
}

function documentUrl(token: string, kind: string): string {
	return apiUrl(
		`/api/public/tasks/${encodeURIComponent(token)}/documents/${encodeURIComponent(kind)}?download=1`,
	);
}

export function PublicTaskPage() {
	const { token = '' } = useParams<{ token: string }>();
	const [data, setData] = useState<PublicTaskPayload | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [notFound, setNotFound] = useState(false);

	useDocumentTitle(data?.jobTitle ? `Order · ${data.jobTitle}` : 'Order tracking');

	useEffect(() => {
		if (!token.trim()) {
			setNotFound(true);
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setNotFound(false);
		setData(null);

		fetchPublicTask(token, controller.signal)
			.then((payload) => {
				if (!controller.signal.aborted) {
					setData(payload);
					setLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (controller.signal.aborted) return;
				const status =
					err && typeof err === 'object' && 'status' in err
						? Number((err as { status: number }).status)
						: 0;
				if (status === 404) {
					setNotFound(true);
				} else {
					setError(err instanceof Error ? err.message : 'Failed to load order');
				}
				setLoading(false);
			});

		return () => controller.abort();
	}, [token]);

	if (loading) {
		return (
			<Center mih='100dvh' bg='#f3f0f4'>
				<Loader size='sm' color='brand' />
			</Center>
		);
	}

	if (notFound) {
		return (
			<Box mih='100dvh' bg='#f3f0f4' py={32} px={16}>
				<Box maw={600} mx='auto'>
					<BrandBar />
					<Box bg='white' p={{ base: 24, sm: 40 }} style={{ borderRadius: '0 0 12px 12px' }}>
						<Title order={1} fz={26} mb='sm'>
							Order not found
						</Title>
						<Text c='dimmed' size='sm'>
							This tracking link is invalid or the order is no longer available.
						</Text>
						<SupportFooter />
					</Box>
				</Box>
			</Box>
		);
	}

	if (error || !data) {
		return (
			<Box mih='100dvh' bg='#f3f0f4' py={32} px={16}>
				<Box maw={600} mx='auto'>
					<BrandBar />
					<Box bg='white' p={{ base: 24, sm: 40 }} style={{ borderRadius: '0 0 12px 12px' }}>
						<Alert color='red' title='Unable to load'>
							{error ?? 'Something went wrong.'}
						</Alert>
						<SupportFooter />
					</Box>
				</Box>
			</Box>
		);
	}

	const availableDocs = data.documents.filter((d) => d.available);

	return (
		<Box mih='100dvh' bg='#f3f0f4' py={32} px={16}>
			<Box maw={600} mx='auto'>
				<BrandBar />
				<Box bg='white' style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
					<Box px={{ base: 24, sm: 40 }} pt={40} pb={16}>
						<Title order={1} fz={{ base: 24, sm: 26 }} lh={1.25} mb='md'>
							{data.headline}
						</Title>
					</Box>

					<Box px={{ base: 24, sm: 40 }} pb={32}>
						<Box
							p={{ base: 16, sm: '20px 24px' }}
							style={{
								backgroundColor: '#f8f0f8',
								borderRadius: 8,
								border: '1px solid #e0c0e1',
							}}
						>
							<Stack gap={6}>
								<DetailRow label='Order' value={data.jobTitle || '—'} />
								{data.taskType && data.taskType !== 'Delivery' ? (
									<DetailRow label='Type' value={data.taskType} />
								) : null}
								<DetailRow
									label={data.destinationLabel || 'Location'}
									value={data.destinationName || '—'}
								/>
								<DetailRow label='Status' value={data.status} />
								{data.completedAt ? (
									<DetailRow
										label='Completed'
										value={formatWhen(data.completedAt)}
									/>
								) : null}
							</Stack>
						</Box>
					</Box>

					{availableDocs.length > 0 ? (
						<Box px={{ base: 24, sm: 40 }} pb={32}>
							<Text fw={600} c='brand.6' mb='sm' size='sm'>
								Documents
							</Text>
							<Stack gap='xs'>
								{availableDocs.map((doc) => (
									<Button
										key={doc.kind}
										component='a'
										href={documentUrl(token, doc.kind)}
										target='_blank'
										rel='noopener noreferrer'
										variant='light'
										color='brand'
										leftSection={<Download size={16} />}
										justify='flex-start'
									>
										Download {docLabel(doc.kind)}
									</Button>
								))}
							</Stack>
						</Box>
					) : null}

					<Box
						px={{ base: 24, sm: 40 }}
						pb={40}
						style={{ borderTop: '1px solid #eadfea' }}
						pt={28}
					>
						<Text fw={600} c='brand.6' mb='md' size='sm'>
							History
						</Text>
						{data.history.length === 0 ? (
							<Text size='sm' c='dimmed'>
								No updates yet.
							</Text>
						) : (
							<Stack gap='md'>
								{data.history.map((event) => (
									<Box key={event.id}>
										<Text size='sm' fw={500}>
											{event.title}
										</Text>
										<Text size='xs' c='dimmed'>
											{formatWhenWithAgo(event.at)}
										</Text>
									</Box>
								))}
							</Stack>
						)}
					</Box>

					<SupportFooter />
				</Box>
			</Box>
		</Box>
	);
}

function BrandBar() {
	return (
		<Box
			py={16}
			px={{ base: 24, sm: 40 }}
			style={{
				background:
					'linear-gradient(90deg, #e31d2d 0%, #bc4f9e 45%, #702f8b 100%)',
				borderRadius: '12px 12px 0 0',
				textAlign: 'center',
			}}
		>
			<img
				src='/logo-white.png'
				alt='Quick Change Display'
				width={200}
				height={79}
				style={{ display: 'block', width: 200, height: 'auto', maxWidth: '100%', margin: '0 auto' }}
			/>
		</Box>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<Text size='sm' c='#3a353c' lh={1.6}>
			<Text span fw={700} c='brand.6'>
				{label}
			</Text>
			{'  '}
			{value}
		</Text>
	);
}

function SupportFooter() {
	return (
		<Box
			px={{ base: 24, sm: 40 }}
			py={20}
			style={{
				backgroundColor: '#faf7fb',
				borderTop: '1px solid #eadfea',
				textAlign: 'center',
			}}
		>
			<Text size='sm' c='#3a353c' mb={8}>
				Thanks for choosing QCD! Please reach out to us at{' '}
				<Anchor href='mailto:qcd@qcdlv.com' c='brand.6'>
					qcd@qcdlv.com
				</Anchor>{' '}
				for support.
			</Text>
			<Text size='xs' c='#8a8490'>
				Quick Change Display
			</Text>
		</Box>
	);
}
