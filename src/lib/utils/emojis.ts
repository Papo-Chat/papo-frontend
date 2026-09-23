// Shared emoji list used by the composer emoji button and the message
// reaction picker. Combines a curated set of common chat unicode emotions
// (each with a label for the filter) with the custom server emojis.
import { sampleEmojis } from '../sample';

export type EmojiOption =
	| { kind: 'unicode'; char: string; label: string }
	| { kind: 'custom'; name: string; label: string; image_blob: string; format: string };

// Curated list of common emojis typically used in chat, with human labels
// so the picker's filter input can match them.
const COMMON: { char: string; label: string }[] = [
	{ char: '😀', label: 'grin' },
	{ char: '😄', label: 'grin' },
	{ char: '😊', label: 'smile' },
	{ char: '🙂', label: 'smile' },
	{ char: '😎', label: 'cool' },
	{ char: '🤣', label: 'laugh' },
	{ char: '😂', label: 'laugh' },
	{ char: '🥰', label: 'heart eyes' },
	{ char: '😍', label: 'heart eyes' },
	{ char: '😘', label: 'kiss' },
	{ char: '🥳', label: 'party' },
	{ char: '🎉', label: 'party' },
	{ char: '🚀', label: 'rocket' },
	{ char: '⭐', label: 'star' },
	{ char: '✨', label: 'sparkle' },
	{ char: '🔥', label: 'fire' },
	{ char: '💯', label: 'hundred' },
	{ char: '✅', label: 'check' },
	{ char: '❌', label: 'cross' },
	{ char: '⚠️', label: 'warning' },
	{ char: '💡', label: 'idea' },
	{ char: '🎯', label: 'target' },
	{ char: '🏆', label: 'trophy' },
	{ char: '💀', label: 'skull' },
	{ char: '👀', label: 'eyes' },
	{ char: '🙌', label: 'hands' },
	{ char: '👍', label: 'thumbs up' },
	{ char: '👎', label: 'thumbs down' },
	{ char: '👌', label: 'ok' },
	{ char: '👏', label: 'clap' },
	{ char: '🙏', label: 'pray' },
	{ char: '🤝', label: 'handshake' },
	{ char: '💪', label: 'muscle' },
	{ char: '❤️', label: 'heart' },
	{ char: '🧡', label: 'heart' },
	{ char: '💛', label: 'heart' },
	{ char: '💚', label: 'heart' },
	{ char: '💜', label: 'heart' },
	{ char: '🖤', label: 'heart' },
	{ char: '🤍', label: 'heart' },
	{ char: '😢', label: 'sad' },
	{ char: '😭', label: 'cry' },
	{ char: '🤔', label: 'thinking' },
	{ char: '🤯', label: 'mind' },
	{ char: '😱', label: 'scream' },
	{ char: '🥵', label: 'hot' },
	{ char: '😳', label: 'blush' },
	{ char: '😌', label: 'relaxed' },
	{ char: '🫡', label: 'salute' },
	{ char: '🙆', label: 'raise hand' }
];

export function allEmojis(): EmojiOption[] {
	const unicode = COMMON.map(({ char, label }): EmojiOption => ({ kind: 'unicode', char, label }));
	const custom = sampleEmojis.map(
		(e): EmojiOption => ({
			kind: 'custom',
			name: e.name,
			label: e.name,
			image_blob: e.image_blob,
			format: e.format
		})
	);
	return [...unicode, ...custom];
}
