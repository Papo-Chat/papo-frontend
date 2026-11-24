import { describe, expect, it } from 'vitest';
import { audioSlotTrackId, desiredScreenAudioPublishers } from '../src/lib/utils/screen-share';

describe('audioSlotTrackId', () => {
	it('maps the first receiving audio transceivers to microphone slots', () => {
		expect(audioSlotTrackId(0, 8)).toBe('papo-audio-0');
		expect(audioSlotTrackId(7, 8)).toBe('papo-audio-7');
	});

	it('maps the transceivers after the microphone slots to screen-audio slots', () => {
		expect(audioSlotTrackId(8, 8)).toBe('papo-screen-audio-0');
		expect(audioSlotTrackId(9, 8)).toBe('papo-screen-audio-1');
	});

	it('returns null for a transceiver that is not a receiving audio slot', () => {
		expect(audioSlotTrackId(-1, 8)).toBeNull();
	});
});

describe('desiredScreenAudioPublishers', () => {
	const members = [
		{ user_id: 'me', screen_audio: true },
		{ user_id: 'a', screen_audio: true },
		{ user_id: 'b', screen_audio: false },
		{ user_id: 'c' },
		{ user_id: 'd', screen_audio: true }
	];

	it('subscribes to every other member publishing screen audio', () => {
		expect(desiredScreenAudioPublishers(members, 'me', 2)).toEqual(['a', 'd']);
	});

	it('never subscribes to the local user or to members without screen audio', () => {
		const wanted = desiredScreenAudioPublishers(members, 'me', 8);
		expect(wanted).not.toContain('me');
		expect(wanted).not.toContain('b');
		expect(wanted).not.toContain('c');
	});

	it('is capped by the number of receive slots and keeps current subscriptions', () => {
		expect(desiredScreenAudioPublishers(members, 'me', 1)).toEqual(['a']);
		expect(desiredScreenAudioPublishers(members, 'me', 1, ['d'])).toEqual(['d']);
		expect(desiredScreenAudioPublishers(members, 'me', 0)).toEqual([]);
	});

	it('drops a current subscription once the publisher stops its screen audio', () => {
		expect(desiredScreenAudioPublishers(members, 'me', 2, ['b', 'a'])).toEqual(['a', 'd']);
	});
});
