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
