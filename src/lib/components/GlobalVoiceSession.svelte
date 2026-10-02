<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as voiceStore from '$lib/store/voice.svelte';
	import { meId } from '$lib/store/session.svelte';
	import { parseChannelName } from '$lib/utils/channel-icon';
	import { clampFloatingVoicePosition } from '$lib/utils/voice-ui';
	import Icon from './Icon.svelte';

	const MOBILE_BREAKPOINT = 560;

	let panelEl: HTMLElement | null = null;
	let position = $state({ x: 12, y: 96 });
	let ready = $state(false);
	let desktopPositioned = false;
	let drag:
		| {
				pointerId: number;
				startX: number;
				startY: number;
				originX: number;
				originY: number;
		  }
		| null = null;

	const channel = $derived(
		voiceStore.state.channelId ? channelsStore.state.byId.get(voiceStore.state.channelId) ?? null : null
	);
	const channelName = $derived(
		channel ? parseChannelName(channel.name).name || channel.name : 'Sala de voz'
	);
	const cameraOn = $derived(voiceStore.state.localCameraStream !== null);
	const screenOn = $derived(voiceStore.state.localScreenStream !== null);
	const me = $derived(meId());
	const localMuted = $derived(
		voiceStore.state.channelId && me
			? (voiceStore.state.channelMembers
					.get(voiceStore.state.channelId)
					?.find((member) => member.user_id === me)?.muted ?? true)
			: true
	);
	const showGlobalSession = $derived(voiceStore.shouldShowGlobalSession(page.url.pathname));

	function returnToVoice(): void {
		const id = voiceStore.state.channelId;
		if (id) void goto(`/channels/${id}`);
	}

	function toggleMute(): void {
		voiceStore.mute(!localMuted);
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

	function clampPosition(next = position): void {
		if (!panelEl || typeof window === 'undefined') return;
		const rect = panelEl.getBoundingClientRect();
		position = clampFloatingVoicePosition(
			next,
			{ width: rect.width, height: rect.height },
			{ width: window.innerWidth, height: window.innerHeight }
		);
	}

	function positionPanel(): void {
		if (!panelEl || typeof window === 'undefined') return;

		if (window.innerWidth > MOBILE_BREAKPOINT) {
			const rect = panelEl.getBoundingClientRect();
			if (!desktopPositioned) {
				position = clampFloatingVoicePosition(
					{ x: window.innerWidth - rect.width - 20, y: 96 },
					{ width: rect.width, height: rect.height },
					{ width: window.innerWidth, height: window.innerHeight }
				);
				desktopPositioned = true;
			} else {
				clampPosition();
			}
		}

		ready = true;
	}

	function startDrag(event: PointerEvent): void {
		if (!panelEl || typeof window === 'undefined' || window.innerWidth <= MOBILE_BREAKPOINT) {
			return;
		}

		event.preventDefault();
		drag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: position.x,
			originY: position.y
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function moveDrag(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId || !panelEl) return;

		const rect = panelEl.getBoundingClientRect();
		position = clampFloatingVoicePosition(
			{
				x: drag.originX + event.clientX - drag.startX,
				y: drag.originY + event.clientY - drag.startY
			},
			{ width: rect.width, height: rect.height },
			{ width: window.innerWidth, height: window.innerHeight }
		);
	}

	function endDrag(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag = null;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
	}

	onMount(() => {
		const frame = requestAnimationFrame(positionPanel);
		const onResize = () => positionPanel();
		window.addEventListener('resize', onResize);

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

{#if showGlobalSession}
	<aside
		bind:this={panelEl}
		class="global-voice-session"
		class:ready
		aria-label="Sessão de voz ativa"
		style: left={`${position.x}px`}
		style: top={`${position.y}px`}
	>
		<button
			class="voice-drag-handle"
			type="button"
			aria-label="Mover controle de voz"
			title="Arrastar controle"
			onpointerdown={startDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
		>
			<span aria-hidden="true">⠿</span>
		</button>

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
				class:active={localMuted}
				onclick={toggleMute}
				aria-label={localMuted ? 'Ativar microfone' : 'Silenciar microfone'}
				title={localMuted ? 'Ativar microfone' : 'Silenciar microfone'}
			>
				<Icon
					name={localMuted ? 'microphone-slash' : 'microphone'}
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
		z-index: 2200;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: min(680px, calc(100vw - 24px));
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		box-shadow: 0 12px 36px rgb(0 0 0 / 0.18);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		opacity: 0;
		transition: opacity 120ms ease;
	}

	.global-voice-session.ready {
		opacity: 1;
	}

	.voice-drag-handle {
		width: 22px;
		height: 34px;
		display: grid;
		place-items: center;
		flex: none;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--muted-soft);
		font-size: 18px;
		line-height: 1;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	.voice-drag-handle:active {
		cursor: grabbing;
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
			left: 10px !important;
			right: 10px;
			top: calc(96px + env(safe-area-inset-top)) !important;
			max-width: none;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 6px;
			padding: 7px;
		}

		.voice-drag-handle {
			display: none;
		}

		.voice-room-link {
			padding-inline: 6px;
		}

		.voice-room-copy span {
			max-width: 110px;
		}

		.voice-session-actions {
			gap: 4px;
		}

		.voice-session-actions button {
			width: 32px;
			height: 32px;
		}
	}

	@media (max-width: 360px) {
		.voice-room-copy strong {
			display: none;
		}

		.voice-room-copy span {
			max-width: 82px;
		}
	}
</style>
