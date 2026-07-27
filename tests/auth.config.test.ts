import { describe, expect, it } from 'vitest';
import { isEntraConfigured } from '../src/auth/config';

describe('isEntraConfigured', () => {
	it('is false without Vite Azure env (test default)', () => {
		expect(isEntraConfigured()).toBe(false);
	});
});
