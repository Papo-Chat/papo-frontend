/**
 * Build display-capture options with best-effort filtering of audio originating
 * from the Papo tab. Unsupported browsers fall back to ordinary system audio
 * capture, preserving the existing capture behavior.
 */
export type AudioCaptureConstraintsWithOwnAudio = MediaTrackConstraints & {
	restrictOwnAudio?: boolean;
};

export interface ScreenShareCaptureOptions {
	video: true;
	audio: true | AudioCaptureConstraintsWithOwnAudio;
}

export function buildScreenShareCaptureOptions(
	supportsRestrictOwnAudio: boolean
): ScreenShareCaptureOptions {
	return {
		video: true,
		audio: supportsRestrictOwnAudio ? { restrictOwnAudio: true } : true
	};
}

/**
 * Start display capture and request that browsers which support it exclude
 * system audio produced by the capturing tab. This does not affect the
 * separate getUserMedia microphone stream.
 *
 * Note: restrictOwnAudio is experimental and best-effort. It may remove all
 * audio originating from the Papo tab and does not filter audio from other
 * applications on every browser/platform.
 */
export async function captureScreenWithOwnAudioRestriction(): Promise<MediaStream> {
	if (
		typeof navigator === 'undefined' ||
		!navigator.mediaDevices?.getDisplayMedia
	) {
		throw new Error('Screen capture is not available in this environment');
	}

	const supported = navigator.mediaDevices.getSupportedConstraints();
	const options = buildScreenShareCaptureOptions('restrictOwnAudio' in supported);

	return navigator.mediaDevices.getDisplayMedia(options);
}
