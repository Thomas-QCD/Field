import { apiFetch, expectJsonField, expectOk } from './client';

export interface Contact {
	id: number;
	name: string;
	title: string;
	phone: string;
	email: string;
}

export async function listContacts(signal?: AbortSignal): Promise<Contact[]> {
	const res = await apiFetch('/api/contacts', { signal });
	const data = await expectOk<{ contacts?: Contact[] }>(
		res,
		'List contacts failed',
	);
	return data.contacts ?? [];
}

export async function getContact(
	id: number,
	signal?: AbortSignal,
): Promise<Contact> {
	const res = await apiFetch(`/api/contacts/${id}`, { signal });
	return expectJsonField(res, 'contact', 'Get contact failed');
}

export async function searchContacts(
	query: string,
	signal?: AbortSignal,
): Promise<Contact[]> {
	const q = query.trim();
	if (q.length < 1) return [];

	const res = await apiFetch(`/api/contacts?q=${encodeURIComponent(q)}`, {
		signal,
	});
	const data = await expectOk<{ contacts?: Contact[] }>(
		res,
		'Contact search failed',
	);
	return data.contacts ?? [];
}

export interface CreateContactInput {
	name: string;
	title?: string;
	phone?: string;
	email?: string;
}

export async function createContact(
	input: CreateContactInput,
): Promise<Contact> {
	const res = await apiFetch('/api/contacts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	return expectJsonField(res, 'contact', 'Create contact failed');
}

export type UpdateContactInput = CreateContactInput;

export async function updateContact(
	id: number,
	input: UpdateContactInput,
): Promise<Contact> {
	const res = await apiFetch(`/api/contacts/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	return expectJsonField(res, 'contact', 'Update contact failed');
}

export async function deleteContact(id: number): Promise<void> {
	const res = await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
	await expectOk(res, 'Delete contact failed');
}
