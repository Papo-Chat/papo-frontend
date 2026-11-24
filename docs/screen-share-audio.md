# Screen-share audio

## Separate track

The audio captured with a screen share is published on its own audio m-line. It is never mixed into the microphone track.

- **Publishing:** after `screen_share_start`, the offer adds a second `sendonly` audio m-line carrying the captured audio. The microphone keeps its original m-line, so the backend classifies the second one as screen audio.
- **Receiving:** the first offer reserves `PUBLIC_VOICE_AUDIO_SLOTS` receive slots for microphones followed by `PUBLIC_VOICE_SCREEN_AUDIO_SLOTS` for screen audio. These must match the backend's `VOICE_AUDIO_SLOTS` and `VOICE_SCREEN_AUDIO_SLOTS`, in that order.
- **Subscribing:** the SFU forwards screen audio only on request. When a member's state has `screen_audio: true`, the client sends `track_subscribe` with `kind: "screen_audio"`, and `track_unsubscribe` when the member stops.
- **Routes:** `voice_audio_routes` entries carry `kind` (`audio` or `screen_audio`). Screen audio has its own local mute and volume, so silencing a transmission does not silence the person's microphone.
- **Mute:** muting the microphone no longer affects the transmission's audio, and the transmission's audio does not count as speaking.

This requires a backend with screen-audio support. Against an older backend the second audio m-line is rejected with `voice-invalid-sdp`.

## Echo mitigation

The separate track does not remove the call's own audio from what the sharer captures. If the capture includes the call playback, viewers still hear themselves inside the transmission's audio; they can now mute that transmission without losing the sharer's voice.

To avoid capturing it in the first place, the voice store requests the experimental `restrictOwnAudio` display-capture constraint when `getSupportedConstraints()` reports support. On compatible browsers, this asks the browser to filter audio originating from the Papo tab out of captured system audio.

The constraint is best-effort and browser-dependent. If unsupported, the client retains the previous `audio: true` behavior. It does not affect the separate microphone capture, but it may also filter other audio produced by the Papo tab. Validate screen-share video, remote call playback, and game/system audio on the target browsers before considering this fully verified.
