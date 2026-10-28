# Screen-share audio echo mitigation

The browser may support the `restrictOwnAudio` display-capture constraint. When available, it asks the browser to exclude audio produced by the capturing tab from the captured audio. This can reduce call-audio loopback when sharing the full display, while leaving the local playback and microphone capture unchanged.

Support and behavior depend on the browser. It is not a general system-audio filter, and it may exclude other audio produced by the same tab. Feature-detect with `navigator.mediaDevices.getSupportedConstraints().restrictOwnAudio`; do not assume the browser honored it. Validate game/system audio and remote call playback in supported target browsers.

The current voice store has no screen-share capture implementation yet (`screenShare()` is a TODO), so this change intentionally documents the proposed capture option rather than wiring it into the WebRTC lifecycle. Do not merge this as a functional fix until it is integrated and tested with the actual screen-share implementation.
