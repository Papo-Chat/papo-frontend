/**
 * Request best-effort filtering of audio produced by the Papo tab from
 * display-captured system audio. Unsupported browsers keep the previous
 * behavior and request ordinary system/tab audio.
 */
export type AudioCaptureConstraintsWithOwnAudio = MediaTrackConstraints & {
	restrictOwnAudio?: boolean;
};

export function screenShareAudioConstraints(
	supported: { restrictOwnAudio?: boolean }
): true | AudioCaptureConstraintsWithOwnAudio {
	return supported.restrictOwnAudio ? { restrictOwnAudio: true } : true;
}
