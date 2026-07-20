import { apiFetch } from './client';

export interface Contact {
	id: number;
	name: string;
	phone: string;
	email: string;
}

export async function listContacts(
	signal?: AbortSignal,
): Promise<Contact[]> {
	const res = await apiFetch('/api/contacts', { signal });
	const data = (await res.json().catch(() => ({}))) as {
		contacts?: Contact[];
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `List contacts failed (${res.status})`);
	}
	return data.contacts ?? [];
}

export async function getContact(
	id: number,
	signal?: AbortSignal,
): Promise<Contact> {
	const res = await apiFetch(`/api/contacts/${id}`, { signal });
	const data = (await res.json().catch(() => ({}))) as {
		contact?: Contact;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Get contact failed (${res.status})`);
	}
	if (!data.contact) {
		throw new Error('Get contact failed: empty response');
	}
	return data.contact;
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
	if (!res.ok) {
		throw new Error(`Contact search failed (${res.status})`);
	}
	const data = (await res.json()) as { contacts: Contact[] };
	return data.contacts ?? [];
}

export interface CreateContactInput {
	name: string;
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

	const data = (await res.json().catch(() => ({}))) as {
		contact?: Contact;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Create contact failed (${res.status})`);
	}
	if (!data.contact) {
		throw new Error('Create contact failed: empty response');
	}
	return data.contact;
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

	const data = (await res.json().catch(() => ({}))) as {
		contact?: Contact;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Update contact failed (${res.status})`);
	}
	if (!data.contact) {
		throw new Error('Update contact failed: empty response');
	}
	return data.contact;
}

export async function deleteContact(id: number): Promise<void> {
	const res = await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error ?? `Delete contact failed (${res.status})`);
	}
}
