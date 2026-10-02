import { describe, expect, it } from 'vitest';
import { emojiText, insertEmojiAtSelection, type EmojiOption } from '../src/lib/utils/emojis';

const custom: EmojiOption = {
	kind: 'custom',
	id: 'e1',
	name: 'party_blob',
	label: 'party_blob',
	image_blob: 'abc',
	format: 'PNG'
};

describe('profile description emoji insertion', () => {
	it('serializes custom emojis as shortcodes', () => {
		expect(emojiText(custom)).toBe(':party_blob:');
	});

	it('inserts a custom emoji at the current cursor without removing line breaks', () => {
		const result = insertEmojiAtSelection('linha 1\nlinha 2', 8, 8, custom);
		expect(result.text).toBe('linha 1\n:party_blob:linha 2');
		expect(result.cursor).toBe(20);
	});

	it('replaces the selected text and advances the cursor for unicode emoji', () => {
		const unicode: EmojiOption = { kind: 'unicode', char: '😀', label: 'grin' };
		const result = insertEmojiAtSelection('abc DEF ghi', 4, 7, unicode);
		expect(result.text).toBe('abc 😀 ghi');
		expect(result.cursor).toBe(6);
	});
});
