import { apiFetch } from './client';

export interface Address {
	id: number;
	addressName: string;
	streetLine: string;
	building: string;
	notes: string;
}

export async function listAddresses(
	signal?: AbortSignal,
): Promise<Address[]> {
	const res = await apiFetch('/api/addresses', { signal });
	const data = (await res.json().catch(() => ({}))) as {
		addresses?: Address[];
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `List addresses failed (${res.status})`);
	}
	return data.addresses ?? [];
}

export async function getAddress(
	id: number,
	signal?: AbortSignal,
): Promise<Address> {
	const res = await apiFetch(`/api/addresses/${id}`, { signal });
	const data = (await res.json().catch(() => ({}))) as {
		address?: Address;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Get address failed (${res.status})`);
	}
	if (!data.address) {
		throw new Error('Get address failed: empty response');
	}
	return data.address;
}

export interface CreateAddressInput {
	addressName?: string;
	streetLine: string;
	building?: string;
	notes?: string;
}

export async function createAddress(
	input: CreateAddressInput,
): Promise<Address> {
	const res = await apiFetch('/api/addresses', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});

	const data = (await res.json().catch(() => ({}))) as {
		address?: Address;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Create address failed (${res.status})`);
	}
	if (!data.address) {
		throw new Error('Create address failed: empty response');
	}
	return data.address;
}

export type UpdateAddressInput = CreateAddressInput;

export async function updateAddress(
	id: number,
	input: UpdateAddressInput,
): Promise<Address> {
	const res = await apiFetch(`/api/addresses/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});

	const data = (await res.json().catch(() => ({}))) as {
		address?: Address;
		error?: string;
	};

	if (!res.ok) {
		throw new Error(data.error ?? `Update address failed (${res.status})`);
	}
	if (!data.address) {
		throw new Error('Update address failed: empty response');
	}
	return data.address;
}

export async function deleteAddress(id: number): Promise<void> {
	const res = await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error ?? `Delete address failed (${res.status})`);
	}
}
