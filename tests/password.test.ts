// Vitest on core logic: client-side password policy (min 8, >=1 uppercase,
// >=1 special char).

import { describe, it, expect } from 'vitest';
import { isValidPassword, passwordErrors, minPasswordLength } from '../src/lib/utils/password';

describe('minPasswordLength', () => {
	it('is 8', () => {
		expect(minPasswordLength).toBe(8);
	});
});

describe('isValidPassword', () => {
	it('accepts a valid password (>=8, uppercase, special)', () => {
		const res = isValidPassword('Abcdef1!');
		expect(res.ok).toBe(true);
		expect(res.errors).toEqual([]);
	});

	it('rejects a password shorter than 8', () => {
		const res = isValidPassword('Ab1!');
		expect(res.ok).toBe(false);
	});

	it('reports the minimum-length error', () => {
		const res = isValidPassword('Ab1!');
		expect(res.errors).toContain(`senha deve ter no mínimo ${minPasswordLength} caracteres`);
	});

	it('rejects a password without an uppercase letter', () => {
		const res = isValidPassword('abcdef1!');
		expect(res.ok).toBe(false);
	});

	it('reports the uppercase error', () => {
		const res = isValidPassword('abcdef1!');
		expect(res.errors).toContain('senha deve conter ao menos 1 letra maiúscula');
	});

	it('rejects a password without a special character', () => {
		const res = isValidPassword('Abcdef12');
		expect(res.ok).toBe(false);
	});

	it('reports the special-character error', () => {
		const res = isValidPassword('Abcdef12');
		expect(res.errors).toContain('senha deve conter ao menos 1 caractere especial');
	});

	it('reports multiple violations at once', () => {
		const res = isValidPassword('ab1');
		expect(res.ok).toBe(false);
		expect(res.errors).toHaveLength(3);
	});

	it('accepts exactly 8 characters when all rules are met', () => {
		const res = isValidPassword('Aa11111!');
		expect(res.ok).toBe(true);
	});
});

describe('passwordErrors', () => {
	it('returns an empty list for a valid password', () => {
		expect(passwordErrors('Abcdef1!')).toEqual([]);
	});

	it('returns the violated rules for an invalid password', () => {
		expect(passwordErrors('ab1')).toHaveLength(3);
	});
});
