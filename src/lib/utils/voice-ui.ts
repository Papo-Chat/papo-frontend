export function isVoiceMemberSpeaking(
	userId: string,
	muted: boolean,
	activeSpeakers: readonly string[]
): boolean {
	return !muted && activeSpeakers.includes(userId);
}

export type FloatingVoicePosition = { x: number; y: number };

export function clampFloatingVoicePosition(
	position: FloatingVoicePosition,
	panel: { width: number; height: number },
	viewport: { width: number; height: number },
	padding = 12
): FloatingVoicePosition {
	const maxX = Math.max(padding, viewport.width - panel.width - padding);
	const maxY = Math.max(padding, viewport.height - panel.height - padding);

	return {
		x: Math.min(Math.max(position.x, padding), maxX),
		y: Math.min(Math.max(position.y, padding), maxY)
	};
}
