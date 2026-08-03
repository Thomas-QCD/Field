import { apiFetch, expectJsonField, expectOk } from './client';

export interface Address {
	id: number;
	addressName: string;
	streetLine: string;
	building: string;
	notes: string;
}

export async function listAddresses(signal?: AbortSignal): Promise<Address[]> {
	const res = await apiFetch('/api/addresses', { signal });
	const data = await expectOk<{ addresses?: Address[] }>(
		res,
		'List addresses failed',
	);
	return data.addresses ?? [];
}

export async function getAddress(
	id: number,
	signal?: AbortSignal,
): Promise<Address> {
	const res = await apiFetch(`/api/addresses/${id}`, { signal });
	return expectJsonField(res, 'address', 'Get address failed');
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
	return expectJsonField(res, 'address', 'Create address failed');
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
	return expectJsonField(res, 'address', 'Update address failed');
}

export async function deleteAddress(id: number): Promise<void> {
	const res = await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
	await expectOk(res, 'Delete address failed');
}
