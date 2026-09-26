// Vitest on background store pure parts: user-uploaded image validation
// (PNG/JPEG only, 2MB max).

import { describe, it, expect } from 'vitest';
import { validateUserBgFile } from '../src/lib/store/background.svelte';

const TWO_MB = 2 * 1024 * 1024;

describe('validateUserBgFile', () => {
	it('accepts PNG and JPEG within the 2MB limit', () => {
		expect(validateUserBgFile({ size: 1, type: 'image/png' })).toBe('');
		expect(validateUserBgFile({ size: TWO_MB - 1, type: 'image/jpeg' })).toBe('');
	});

	it('accepts exactly 2MB', () => {
		expect(validateUserBgFile({ size: TWO_MB, type: 'image/png' })).toBe('');
	});

	it('rejects other image types (GIF/WEBP)', () => {
		expect(validateUserBgFile({ size: 1, type: 'image/gif' })).toContain('tipo inválido');
		expect(validateUserBgFile({ size: 1, type: 'image/webp' })).toContain('tipo inválido');
	});

	it('rejects files over 2MB', () => {
		const err = validateUserBgFile({ size: TWO_MB + 1, type: 'image/png' });
		expect(err).toContain('excede o tamanho máximo de 2MB');
	});

	it('reports both errors when applicable', () => {
		const err = validateUserBgFile({ size: TWO_MB + 1, type: 'image/webp' });
		expect(err).toContain('tipo inválido');
		expect(err).toContain('excede o tamanho máximo de 2MB');
	});
});
