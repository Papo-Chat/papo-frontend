import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as voiceStore from '../src/lib/store/voice.svelte';

beforeEach(() => {
	voiceStore.state.connected = true;
	voiceStore.state.channelId = 'voice-1';
	voiceStore.state.localMuted = false;
});

afterEach(() => {
	voiceStore.onSocketClose();
});

describe('persistent global voice session', () => {

	it('detects a voice_leave for the local active session only', () => {
		expect(
			voiceStore.isLocalVoiceLeave(
				{ channel_id: 'voice-1', user_id: 'me' },
				'voice-1',
				'me'
			)
		).toBe(true);
		expect(
			voiceStore.isLocalVoiceLeave(
				{ channel_id: 'voice-1', user_id: 'other' },
				'voice-1',
				'me'
			)
		).toBe(false);
		expect(
			voiceStore.isLocalVoiceLeave(
				{ channel_id: 'voice-2', user_id: 'me' },
				'voice-1',
				'me'
			)
		).toBe(false);
	});
	it('stays represented while navigating to DMs, admin and settings', () => {
		expect(voiceStore.shouldShowGlobalSession('/dm/dm-1')).toBe(true);
		expect(voiceStore.shouldShowGlobalSession('/admin/channels')).toBe(true);
		expect(voiceStore.shouldShowGlobalSession('/user/settings/profile')).toBe(true);

		expect(voiceStore.state.connected).toBe(true);
		expect(voiceStore.state.channelId).toBe('voice-1');
		expect(voiceStore.state.localMuted).toBe(false);
	});

	it('hides the global controls only while the active voice room page is open', () => {
		expect(voiceStore.shouldShowGlobalSession('/channels/voice-1')).toBe(false);
		expect(voiceStore.shouldShowGlobalSession('/channels/text-1')).toBe(true);
		expect(voiceStore.state.connected).toBe(true);
		expect(voiceStore.state.channelId).toBe('voice-1');
	});

	it('does not show a stale session after the voice lifecycle is cleared', () => {
		voiceStore.onSocketClose();
		expect(voiceStore.state.connected).toBe(false);
		expect(voiceStore.state.channelId).toBeNull();
		expect(voiceStore.state.localMuted).toBe(true);
		expect(voiceStore.shouldShowGlobalSession('/dm/dm-1')).toBe(false);
	});
});
