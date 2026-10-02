import { describe, expect, it } from 'vitest';
import {
	clampFloatingVoicePosition,
	isVoiceMemberSpeaking
} from '../src/lib/utils/voice-ui';

describe('voice speaking indicator', () => {
	it('marks every unmuted user present in activeSpeakers as speaking', () => {
		const active = ['u1', 'u2'];
		expect(isVoiceMemberSpeaking('u1', false, active)).toBe(true);
		expect(isVoiceMemberSpeaking('u2', false, active)).toBe(true);
	});

	it('never highlights a muted user even if a stale active-speaker event still contains it', () => {
		expect(isVoiceMemberSpeaking('u1', true, ['u1'])).toBe(false);
	});

	it('does not highlight users outside the active-speaker set', () => {
		expect(isVoiceMemberSpeaking('u3', false, ['u1', 'u2'])).toBe(false);
	});
});

describe('floating voice control position', () => {
	it('keeps a dragged panel inside the viewport', () => {
		expect(
			clampFloatingVoicePosition(
				{ x: 1000, y: -30 },
				{ width: 300, height: 60 },
				{ width: 800, height: 600 }
			)
		).toEqual({ x: 488, y: 12 });
	});

	it('keeps a valid position unchanged', () => {
		expect(
			clampFloatingVoicePosition(
				{ x: 420, y: 96 },
				{ width: 300, height: 60 },
				{ width: 800, height: 600 }
			)
		).toEqual({ x: 420, y: 96 });
	});
});
