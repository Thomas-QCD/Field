import { Capacitor } from '@capacitor/core';
import type { TaskAttachment } from '../types/task';
import { apiFetch, expectJsonField, expectOk } from './client';

/**
 * Web file-dialog hint. Prefer wildcards so browsers offer both photos and video.
 * Exact types are still enforced by validateAttachmentFile / the API.
 */
export const ATTACHMENT_ACCEPT =
	'image/*,video/*,application/pdf,.docx,.xlsx,.csv,.txt';

/**
 * Native WebViews (esp. Android) often only honor the first accept token, so a
 * list starting with images never surfaces videos. Omit accept on Capacitor and
 * rely on client + server validation instead.
 */
export function attachmentAcceptAttr(): string | undefined {
	if (Capacitor.isNativePlatform()) return undefined;
	return ATTACHMENT_ACCEPT;
}

/** Photos + videos for the mobile Library picker (camera stays image-only). */
export function mediaLibraryAcceptAttr(): string | undefined {
	if (Capacitor.isNativePlatform()) return undefined;
	return 'image/*,video/*';
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_ATTACHMENT_BYTES = 150 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'image/gif',
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'text/csv',
	'text/plain',
	'video/mp4',
	'video/webm',
	'video/quicktime',
]);

export function isVideoMime(mimeType: string): boolean {
	return mimeType.startsWith('video/');
}

export function maxBytesForMime(mimeType: string): number {
	return isVideoMime(mimeType)
		? MAX_VIDEO_ATTACHMENT_BYTES
		: MAX_ATTACHMENT_BYTES;
}

export function oversizeErrorMessage(
	mimeType: string,
	maxBytes: number,
): string {
	if (isVideoMime(mimeType)) {
		return `Video exceeds ${Math.round(maxBytes / (1024 * 1024))} MB. Record at a lower resolution (try 1080p) if possible.`;
	}
	return `File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit`;
}

export function resolveMimeType(file: File): string {
	const name = file.name.toLowerCase();
	// Prefer extension for known types — Android sometimes reports empty or odd MIME.
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
	if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
	if (name.endsWith('.webm')) return 'video/webm';
	if (name.endsWith('.mov')) return 'video/quicktime';

	const fromBrowser = file.type.toLowerCase().split(';')[0].trim();
	if (fromBrowser && ALLOWED_MIME_TYPES.has(fromBrowser)) return fromBrowser;
	// Map common aliases Android may report
	if (fromBrowser === 'video/x-m4v' || fromBrowser === 'video/mpeg') {
		return 'video/mp4';
	}
	if (fromBrowser === 'image/jpg') return 'image/jpeg';
	return fromBrowser;
}

/**
 * Client-side size/type check before upload. Returns an error message or null.
 */
export function validateAttachmentFile(file: File): string | null {
	if (file.size <= 0) {
		return `“${file.name}” is empty`;
	}
	const mimeType = resolveMimeType(file);
	if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
		return `Unsupported or unknown file type: ${file.name}`;
	}
	const maxBytes = maxBytesForMime(mimeType);
	if (file.size > maxBytes) {
		return oversizeErrorMessage(mimeType, maxBytes);
	}
	return null;
}

export async function listAttachments(
	taskId: number,
	signal?: AbortSignal,
): Promise<TaskAttachment[]> {
	const res = await apiFetch(`/api/tasks/${taskId}/attachments`, { signal });
	const data = await expectOk<{ attachments?: TaskAttachment[] }>(
		res,
		'List attachments failed',
	);
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
	return expectJsonField(res, 'downloadUrl', 'Download URL failed');
}

export async function deleteAttachment(
	taskId: number,
	attachmentId: number,
): Promise<void> {
	const res = await apiFetch(
		`/api/tasks/${taskId}/attachments/${attachmentId}`,
		{ method: 'DELETE' },
	);
	await expectOk(res, 'Delete attachment failed');
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
	const data = await expectOk<Partial<PresignResult>>(res, 'Presign failed');
	if (!data.uploadUrl || !data.storageKey) {
		throw new Error('Presign failed: empty response');
	}
	return data as PresignResult;
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
	return expectJsonField(res, 'attachment', 'Confirm attachment failed');
}

/**
 * Presign → PUT to S3 → confirm metadata row.
 */
export async function uploadAttachment(
	taskId: number,
	file: File,
	uploadedByUserId: string,
): Promise<TaskAttachment> {
	const validationError = validateAttachmentFile(file);
	if (validationError) {
		throw new Error(validationError);
	}

	const mimeType = resolveMimeType(file);

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
