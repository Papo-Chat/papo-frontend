/**
 * Request best-effort filtering of audio produced by the Papo tab from
 * display-captured system audio. Unsupported browsers keep the previous
 * behavior and request ordinary system/tab audio.
 */
export type AudioCaptureConstraintsWithOwnAudio = MediaTrackConstraints & {
	restrictOwnAudio?: boolean;
};

export function screenShareAudioConstraints(supported: object): true | AudioCaptureConstraintsWithOwnAudio {
	// restrictOwnAudio is experimental and is not present in every version of
	// TypeScript's DOM declarations, so narrow it locally instead of relying
	// on MediaTrackSupportedConstraints to declare it.
	const supportsOwnAudio = (supported as { restrictOwnAudio?: boolean }).restrictOwnAudio === true;
	return supportsOwnAudio ? { restrictOwnAudio: true } : true;
}

/**
 * SFU track id of the n-th receiving audio transceiver, in m-line order.
 * The backend binds its send slots to our audio m-lines in order: first the
 * `voiceSlots` microphone slots (`papo-audio-N`), then the screen-share audio
 * slots (`papo-screen-audio-N`).
 */
export function audioSlotTrackId(index: number, voiceSlots: number): string | null {
	if (!Number.isInteger(index) || index < 0) return null;
	return index < voiceSlots ? `papo-audio-${index}` : `papo-screen-audio-${index - voiceSlots}`;
}

/**
 * Publishers whose screen-share audio should be subscribed: every other member
 * that announces `screen_audio`, capped at the number of receive slots.
 * Existing subscriptions are kept first so a full room does not churn them.
 */
export function desiredScreenAudioPublishers(
	members: ReadonlyArray<{ user_id: string; screen_audio?: boolean }>,
	selfId: string | null,
	slots: number,
	current: Iterable<string> = []
): string[] {
	const available: string[] = [];
	for (const member of members) {
		if (member.screen_audio && member.user_id !== selfId && !available.includes(member.user_id)) {
			available.push(member.user_id);
		}
	}

	const kept = [...current].filter((userId) => available.includes(userId));
	const added = available.filter((userId) => !kept.includes(userId));
	return [...kept, ...added].slice(0, Math.max(0, slots));
}
