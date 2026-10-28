# Screen-share audio echo mitigation

The voice store requests the experimental `restrictOwnAudio` display-capture constraint when `getSupportedConstraints()` reports support. On compatible browsers, this asks the browser to filter audio originating from the Papo tab out of captured system audio, which may prevent the call's remote audio from being looped back into the transmitted screen audio.

The constraint is best-effort and browser-dependent. If unsupported, the client retains the previous `audio: true` behavior. It does not affect the separate microphone capture, but it may also filter other audio produced by the Papo tab. Validate screen-share video, remote call playback, and game/system audio on the target browsers before considering this fully verified.
