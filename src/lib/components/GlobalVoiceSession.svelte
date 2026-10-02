<script lang="ts">
	import { goto } from '$app/navigation';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as voiceStore from '$lib/store/voice.svelte';
	import { parseChannelName } from '$lib/utils/channel-icon';
	import Icon from './Icon.svelte';

	const channel = $derived(
		voiceStore.state.channelId ? channelsStore.state.byId.get(voiceStore.state.channelId) ?? null : null
	);
	const channelName = $derived(
		channel ? parseChannelName(channel.name).name || channel.name : 'Sala de voz'
	);
	const cameraOn = $derived(voiceStore.state.localCameraStream !== null);
	const screenOn = $derived(voiceStore.state.localScreenStream !== null);

	function returnToVoice(): void {
		const id = voiceStore.state.channelId;
		if (id) void goto(`/channels/${id}`);
	}

	function toggleMute(): void {
		voiceStore.mute(!voiceStore.state.localMuted);
	}

	async function toggleCamera(): Promise<void> {
		await voiceStore.camera(!cameraOn).catch((error) => {
			voiceStore.state.lastError =
				error instanceof Error ? error.message : 'Falha ao alterar a câmera.';
		});
	}

	async function toggleScreen(): Promise<void> {
		await voiceStore.screenShare(!screenOn).catch((error) => {
			voiceStore.state.lastError =
				error instanceof Error ? error.message : 'Falha ao alterar o compartilhamento.';
		});
	}

	function leave(): void {
		voiceStore.leave(voiceStore.state.channelId);
	}
</script>

{#if voiceStore.state.connected && voiceStore.state.channelId}
	<aside class="global-voice-session" aria-label="Sessão de voz ativa">
		<button class="voice-room-link" type="button" onclick={returnToVoice}>
			<span class="voice-live-dot" aria-hidden="true"></span>
			<span class="voice-room-copy">
				<strong>Na sala de voz</strong>
				<span>{channelName}</span>
			</span>
		</button>

		<div class="voice-session-actions">
			<button
				type="button"
				class:active={voiceStore.state.localMuted}
				onclick={toggleMute}
				aria-label={voiceStore.state.localMuted ? 'Ativar microfone' : 'Silenciar microfone'}
				title={voiceStore.state.localMuted ? 'Ativar microfone' : 'Silenciar microfone'}
			>
				<Icon
					name={voiceStore.state.localMuted ? 'microphone-slash' : 'microphone'}
					variant="light"
				/>
			</button>

			<button
				type="button"
				class:active={cameraOn}
				onclick={() => void toggleCamera()}
				disabled={voiceStore.state.cameraBusy}
				aria-label={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
				title={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
			>
				<Icon name={cameraOn ? 'video-camera-slash' : 'video-camera'} variant="light" />
			</button>

			<button
				type="button"
				class:active={screenOn}
				onclick={() => void toggleScreen()}
				disabled={voiceStore.state.screenBusy}
				aria-label={screenOn ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
				title={screenOn ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
			>
				<Icon name="monitor" variant="light" />
			</button>

			<button
				type="button"
				class="danger"
				onclick={leave}
				aria-label="Sair da sala de voz"
				title="Sair da sala de voz"
			>
				<Icon name="x" variant="light" />
			</button>
		</div>
	</aside>
{/if}

<style>
	.global-voice-session {
		position: fixed;
		left: 50%;
		bottom: 16px;
		z-index: 2200;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(680px, calc(100vw - 24px));
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		box-shadow: 0 12px 36px rgb(0 0 0 / 0.18);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
	}

	.voice-room-link {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 4px 8px;
		border: 0;
		background: transparent;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.voice-live-dot {
		width: 9px;
		height: 9px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: #24c982;
		box-shadow: 0 0 0 3px color-mix(in srgb, #24c982 18%, transparent);
	}

	.voice-room-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.voice-room-copy strong {
		font-size: 11px;
	}

	.voice-room-copy span {
		max-width: 240px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 10px;
		color: var(--muted-soft);
	}

	.voice-session-actions {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.voice-session-actions button {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.voice-session-actions button.active {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 36%, var(--border));
	}

	.voice-session-actions button.danger {
		color: #d95163;
	}

	.voice-session-actions button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	@media (max-width: 560px) {
		.global-voice-session {
			left: 12px;
			right: 12px;
			transform: none;
			justify-content: space-between;
		}

		.voice-room-copy span {
			max-width: 120px;
		}
	}
</style>
