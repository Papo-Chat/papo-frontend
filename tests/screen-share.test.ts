import { describe, expect, it } from 'vitest';
import { buildScreenShareCaptureOptions } from '../src/lib/utils/screen-share';

describe('buildScreenShareCaptureOptions', () => {
	it('requests own-tab audio restriction when supported', () => {
		expect(buildScreenShareCaptureOptions(true)).toEqual({
			video: true,
			audio: { restrictOwnAudio: true }
		});
	});

	it('preserves regular system audio capture when unsupported', () => {
		expect(buildScreenShareCaptureOptions(false)).toEqual({
			video: true,
			audio: true
		});
	});
});
