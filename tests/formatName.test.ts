import { describe, expect, it } from 'vitest'
import { formatShortName, formatShortNameList } from '../src/formatName'

describe('formatShortName', () => {
	it('returns empty/whitespace as trimmed empty', () => {
		expect(formatShortName('')).toBe('')
		expect(formatShortName('   ')).toBe('')
	})

	it('leaves a single token unchanged', () => {
		expect(formatShortName('Omar')).toBe('Omar')
		expect(formatShortName('  Omar  ')).toBe('Omar')
	})

	it('shortens first + last to first + initial', () => {
		expect(formatShortName('Omar Ortiz')).toBe('Omar O.')
		expect(formatShortName('jane doe')).toBe('jane D.')
	})

	it('uses the first character of the remainder after the first space', () => {
		expect(formatShortName('Mary Ann Smith')).toBe('Mary A.')
	})

	it('returns first name when trailing space has no initial', () => {
		expect(formatShortName('Omar ')).toBe('Omar')
	})
})

describe('formatShortNameList', () => {
	it('formats a comma-separated list', () => {
		expect(formatShortNameList('Omar Ortiz, Jane Doe')).toBe('Omar O., Jane D.')
	})

	it('skips empty segments', () => {
		expect(formatShortNameList('Omar Ortiz, , Jane Doe')).toBe('Omar O., Jane D.')
	})

	it('handles a single name', () => {
		expect(formatShortNameList('Omar Ortiz')).toBe('Omar O.')
	})
})
