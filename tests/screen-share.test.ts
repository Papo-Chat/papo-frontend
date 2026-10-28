import { describe, expect, it } from 'vitest';
import { screenShareAudioConstraints } from '../src/lib/utils/screen-share';

describe('screenShareAudioConstraints', () => {
	it('requests own-tab audio restriction when supported', () => {
		expect(screenShareAudioConstraints({ restrictOwnAudio: true })).toEqual({
			restrictOwnAudio: true
		});
	});

	it('preserves existing audio capture when unsupported', () => {
		expect(screenShareAudioConstraints({})).toBe(true);
		expect(screenShareAudioConstraints({ restrictOwnAudio: false })).toBe(true);
	});
});
