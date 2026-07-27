import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	ACTIVATION_CODE_PATTERN,
	hashSecret,
	looksLikeJwt,
	mintActivationCode,
	mintDeviceSessionToken,
	normalizeActivationCode,
} from '../server/mobileAuth.mjs';

describe('mobileAuth helpers', () => {
	it('mints field1. activation codes matching the pattern', () => {
		const code = mintActivationCode();
		expect(code.startsWith('field1.')).toBe(true);
		expect(ACTIVATION_CODE_PATTERN.test(code)).toBe(true);
		expect(normalizeActivationCode(`  ${code}  `)).toBe(code);
	});

	it('rejects invalid activation codes', () => {
		expect(() => normalizeActivationCode('not-a-code')).toThrow(
			/Invalid activation code/,
		);
		expect(() => normalizeActivationCode('')).toThrow(/Invalid activation code/);
		expect(() => normalizeActivationCode(null)).toThrow(/required/);
	});

	it('hashes secrets with sha256 hex', () => {
		expect(hashSecret('field1.abc')).toBe(
			createHash('sha256').update('field1.abc', 'utf8').digest('hex'),
		);
	});

	it('distinguishes JWTs from opaque device tokens', () => {
		expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true);
		expect(looksLikeJwt(mintDeviceSessionToken())).toBe(false);
	});
});
