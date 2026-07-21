import type { TaskAttachment } from '../types/task';
import { apiFetch } from './client';

export const ATTACHMENT_ACCEPT =
	'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf,.docx,.xlsx,.csv,.txt';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function listAttachments(
	taskId: number,
	signal?: AbortSignal,
): Promise<TaskAttachment[]> {
	const res = await apiFetch(`/api/tasks/${taskId}/attachments`, { signal });
	const data = (await res.json().catch(() => ({}))) as {
		attachments?: TaskAttachment[];
		error?: string;
	};
	if (!res.ok) {
		throw new Error(data.error ?? `List attachments failed (${res.status})`);
	}
	return data.attachments ?? [];
}

export async function getAttachmentDownloadUrl(
	taskId: number,
	attachmentId: number,
	opts?: { inline?: boolean },
): Promise<string> {
	const params = opts?.inline ? '?inline=1' : '';
	const res = await apiFetch(
		`/api/tasks/${taskId}/attachments/${attachmentId}/url${params}`,
	);
	const data = (await res.json().catch(() => ({}))) as {
		downloadUrl?: string;
		error?: string;
	};
	if (!res.ok) {
		throw new Error(data.error ?? `Download URL failed (${res.status})`);
	}
	if (!data.downloadUrl) {
		throw new Error('Download URL failed: empty response');
	}
	return data.downloadUrl;
}

export async function deleteAttachment(
	taskId: number,
	attachmentId: number,
): Promise<void> {
	const res = await apiFetch(
		`/api/tasks/${taskId}/attachments/${attachmentId}`,
		{ method: 'DELETE' },
	);
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error ?? `Delete attachment failed (${res.status})`);
	}
}

interface PresignResult {
	uploadUrl: string;
	storageKey: string;
	fileName: string;
	mimeType: string;
	fileSizeBytes: number;
	kind: string;
	uploadedByUserId: string;
}

async function presignAttachment(
	taskId: number,
	input: {
		fileName: string;
		mimeType: string;
		fileSizeBytes: number;
		uploadedByUserId: string;
	},
): Promise<PresignResult> {
	const res = await apiFetch(`/api/tasks/${taskId}/attachments/presign`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	const data = (await res.json().catch(() => ({}))) as PresignResult & {
		error?: string;
	};
	if (!res.ok) {
		throw new Error(data.error ?? `Presign failed (${res.status})`);
	}
	if (!data.uploadUrl || !data.storageKey) {
		throw new Error('Presign failed: empty response');
	}
	return data;
}

async function confirmAttachment(
	taskId: number,
	input: {
		storageKey: string;
		fileName: string;
		mimeType: string;
		fileSizeBytes: number;
		uploadedByUserId: string;
		caption?: string | null;
	},
): Promise<TaskAttachment> {
	const res = await apiFetch(`/api/tasks/${taskId}/attachments`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	const data = (await res.json().catch(() => ({}))) as {
		attachment?: TaskAttachment;
		error?: string;
	};
	if (!res.ok) {
		throw new Error(data.error ?? `Confirm attachment failed (${res.status})`);
	}
	if (!data.attachment) {
		throw new Error('Confirm attachment failed: empty response');
	}
	return data.attachment;
}

function resolveMimeType(file: File): string {
	if (file.type) return file.type.toLowerCase();
	const name = file.name.toLowerCase();
	if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
	if (name.endsWith('.png')) return 'image/png';
	if (name.endsWith('.webp')) return 'image/webp';
	if (name.endsWith('.gif')) return 'image/gif';
	if (name.endsWith('.heic')) return 'image/heic';
	if (name.endsWith('.heif')) return 'image/heif';
	if (name.endsWith('.pdf')) return 'application/pdf';
	if (name.endsWith('.docx')) {
		return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
	}
	if (name.endsWith('.xlsx')) {
		return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
	}
	if (name.endsWith('.csv')) return 'text/csv';
	if (name.endsWith('.txt')) return 'text/plain';
	return '';
}

/**
 * Presign → PUT to S3 → confirm metadata row.
 */
export async function uploadAttachment(
	taskId: number,
	file: File,
	uploadedByUserId: string,
): Promise<TaskAttachment> {
	if (file.size <= 0) {
		throw new Error('File is empty');
	}
	if (file.size > MAX_ATTACHMENT_BYTES) {
		throw new Error('File exceeds 25 MB limit');
	}

	const mimeType = resolveMimeType(file);
	if (!mimeType) {
		throw new Error('Unsupported or unknown file type');
	}

	const presign = await presignAttachment(taskId, {
		fileName: file.name,
		mimeType,
		fileSizeBytes: file.size,
		uploadedByUserId,
	});

	const putRes = await fetch(presign.uploadUrl, {
		method: 'PUT',
		headers: { 'Content-Type': mimeType },
		body: file,
	});
	if (!putRes.ok) {
		throw new Error(`S3 upload failed (${putRes.status})`);
	}

	return confirmAttachment(taskId, {
		storageKey: presign.storageKey,
		fileName: presign.fileName,
		mimeType: presign.mimeType,
		fileSizeBytes: presign.fileSizeBytes,
		uploadedByUserId,
	});
}
