<script lang="ts">
	import { meId } from '$lib/store/session.svelte';
	import * as voiceStore from '$lib/store/voice.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { Channel } from '$lib/types';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	let { channel } = $props<{ channel: Channel }>();

	const me = $derived(meId());
	const joined = $derived(voiceStore.isJoined(channel.id));
	const members = $derived(voiceStore.state.members);
	const activeSpeaker = $derived(voiceStore.state.activeSpeaker);

	let joining = $state(false);
	let error: string | null = $state(null);

	// Mute state of the local user: the member list (server echo) is the
	// single source of truth; toggling updates it optimistically (see
	// toggleMute) so the UI reacts to self-muting without waiting on the
	// round-trip.
	const myMuted = $derived(
		members.find((m) => m.user_id === me)?.muted ?? false
	);

	// Clear the joining state once the server confirms (voice_joined).
	$effect(() => {
		if (joined) {
			joining = false;
			error = null;
		}
	});

	function join(): void {
		if (joined || joining) return;
		joining = true;
		error = null;
		voiceStore.join(channel.id);
	}

	function leave(): void {
		voiceStore.leave(channel.id);
		joining = false;
	}

	function toggleMute(): void {
		const next = !myMuted;

		voiceStore.mute(next);

		const idx = members.findIndex((m) => m.user_id === me);

		if (idx >= 0) {
			const updated = [...members];

			updated[idx] = {
				...updated[idx],
				muted: next
			};

			voiceStore.state.members = updated;
		}

		if (next && voiceStore.state.activeSpeaker === me) {
			voiceStore.state.activeSpeaker = null;
		}
	}

	function displayFor(id: string) {
		return usersStore.state.byId.get(id);
	}
</script>

<div class="voice-room">
	{#if joined}
		<div class="voice-header">
			<h3 class="voice-title">
				<Icon name="speaker-hifi" variant="light" />
				Voz — {channel.name}
			</h3>

			{#if error}
				<span class="voice-error">{error}</span>
			{/if}
		</div>

		<div class="voice-members">
			{#if members.length === 0}
				<p class="voice-empty">Ninguém na voz.</p>
			{:else}
				{#each members as m (m.user_id)}
					{@const u = displayFor(m.user_id)}
					{@const isSpeaking = m.user_id === activeSpeaker && !m.muted}

					<div
						class="voice-member {isSpeaking ? 'speaking' : ''} {m.user_id === me ? 'me' : ''}"
						aria-label="{u?.nickname || u?.username} {isSpeaking ? '(falando)' : ''}"
					>
						<Avatar user={u} size={32} />

						<div class="voice-member-info">


							{#if m.muted}
								<span class="voice-member-name">
									{u?.nickname || u?.username}
								</span>
								<Icon name="microphone-slash" variant="light" />
							{:else if isSpeaking}
								<span class="voice-member-name">
									{u?.nickname || u?.username}
								</span>
								<Icon name="microphone-stage" variant="light" />
							{:else}
								<span class="voice-member-name">
									{u?.nickname || u?.username}
								</span>
								<Icon name="microphone" variant="light" />
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="voice-controls">
			<button
				class="voice-btn"
				on:click={toggleMute}
				aria-label={myMuted ? 'Desativar microfone' : 'Ativar microfone'}
			>
				<Icon name={myMuted ? 'microphone-slash' : 'microphone'} variant="light" />
				<span>{myMuted ? 'Falar' : 'Mudo'}</span>
			</button>

			<button
				class="voice-btn danger"
				on:click={leave}
				aria-label="Sair da voz"
			>
				<Icon name="x" variant="light" />
				<span>Sair</span>
			</button>
		</div>
	{:else}
		<div class="voice-join">
			<button
				class="voice-join-btn"
				on:click={join}
				disabled={joining}
			>
				{#if joining}
					<Icon name="arrow-clockwise" variant="light" />
					Conectando…
				{:else}
					<Icon name="microphone" variant="light" />
					Entrar na voz
				{/if}
			</button>

			{#if error}
				<span class="voice-error">{error}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.voice-room {
		padding: 16px;
	}
	.voice-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.voice-title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}
	.voice-error {
		color: var(--danger);
		font-size: 13px;
	}

	.voice-members {
		display: grid;
		gap: 6px;
		margin-bottom: 12px;
	}
	.voice-member {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.6);
	}
	.voice-member.speaking {
		outline: 2px solid var(--accent, #54aaf2);
		background: rgba(84, 170, 242, 0.12);
	}
	.voice-member.me .voice-member-name {
		font-weight: 700;
	}
	.voice-member-info {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.voice-member-name {
		font-size: 14px;
	}
	.voice-empty {
		margin: 0;
		color: var(--muted-soft);
		font-size: 13px;
	}

	.voice-controls {
		display: flex;
		gap: 8px;
	}
	.voice-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		font: inherit;
		font-size: 13px;
		padding: 8px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		color: var(--text);
	}
	.voice-btn:hover {
		background: rgba(255, 255, 255, 0.65);
	}
	.voice-btn.danger {
		color: var(--danger);
	}

	.voice-join {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 24px;
	}
	.voice-join-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		padding: 10px 20px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: linear-gradient(180deg, #54aaf2, #0a73d6);
		color: #fff;
		cursor: pointer;
	}
	.voice-join-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 8px 18px rgba(10, 115, 214, 0.3);
	}
	.voice-join-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}
</style>
