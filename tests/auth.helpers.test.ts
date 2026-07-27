import { describe, expect, it, afterEach } from 'vitest';
import {
	isAuthExemptPath,
	isEntraAuthEnabled,
} from '../server/auth.mjs';

describe('server auth helpers', () => {
	const prevTenant = process.env.AZURE_TENANT_ID;
	const prevClient = process.env.AZURE_CLIENT_ID;

	afterEach(() => {
		if (prevTenant === undefined) delete process.env.AZURE_TENANT_ID;
		else process.env.AZURE_TENANT_ID = prevTenant;
		if (prevClient === undefined) delete process.env.AZURE_CLIENT_ID;
		else process.env.AZURE_CLIENT_ID = prevClient;
	});

	it('isAuthExemptPath allows health and mobile activate only', () => {
		expect(isAuthExemptPath('/api/health')).toBe(true);
		expect(isAuthExemptPath('/api/mobile/activate')).toBe(true);
		expect(isAuthExemptPath('/api/mobile/tasks')).toBe(false);
		expect(isAuthExemptPath('/api/tasks')).toBe(false);
	});

	it('isEntraAuthEnabled requires tenant and client', () => {
		delete process.env.AZURE_TENANT_ID;
		delete process.env.AZURE_CLIENT_ID;
		expect(isEntraAuthEnabled()).toBe(false);

		process.env.AZURE_TENANT_ID = 'tenant';
		process.env.AZURE_CLIENT_ID = 'client';
		expect(isEntraAuthEnabled()).toBe(true);
	});
});
