<script lang="ts">
	import { meId } from '$lib/store/session.svelte';
	import { openProfile } from '$lib/store/ui.svelte';
	import * as voiceStore from '$lib/store/voice.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { Channel, RoleSummary } from '$lib/types';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	let { channel } = $props<{ channel: Channel }>();

	const me = $derived(meId());
	const joined = $derived(voiceStore.isJoined(channel.id));

	const members = $derived(
		voiceStore.state.channelMembers.get(channel.id) ?? []
	);

	const activeSpeaker = $derived(
		joined ? voiceStore.state.activeSpeaker : null
	);

	let joining = $state(false);
	let error: string | null = $state(null);

	const myMuted = $derived(
		members.find((m) => m.user_id === me)?.muted ?? false
	);

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

		const current =
			voiceStore.state.channelMembers.get(channel.id) ?? [];

		const idx = current.findIndex((m) => m.user_id === me);

		if (idx >= 0) {
			const updated = [...current];

			updated[idx] = {
				...updated[idx],
				muted: next
			};

			voiceStore.state.channelMembers.set(
				channel.id,
				updated
			);

			if (joined) {
				voiceStore.state.members = updated;
			}
		}

		if (
			next &&
			voiceStore.state.activeSpeaker === me
		) {
			voiceStore.state.activeSpeaker = null;
		}
	}

	function displayFor(id: string) {
		return usersStore.state.byId.get(id);
	}
</script>

<div class="voice-room">
	<div class="voice-header">
		<h3 class="voice-title">
			<Icon name="speaker-hifi" variant="light" />
			<span>Voz — {channel.name}</span>
		</h3>

		{#if error}
			<span class="voice-error">{error}</span>
		{/if}
	</div>

	<div class="voice-box">
		<div class="voice-box-header">
			<div class="voice-status">
				<span
					class="voice-status-dot"
					class:connected={joined}
				></span>

				<span>
					{#if joined}
						Conectado
					{:else if members.length > 0}
						{members.length}
						{members.length === 1 ? 'pessoa' : 'pessoas'} na voz
					{:else}
						Canal vazio
					{/if}
				</span>
			</div>

			{#if !joined}
				<button
					class="voice-join-btn"
					onclick={join}
					disabled={joining}
				>
					{#if joining}
						<Icon
							name="arrow-clockwise"
							variant="light"
						/>
						<span>Conectando…</span>
					{:else}
						<Icon
							name="microphone"
							variant="light"
						/>
						<span>Entrar</span>
					{/if}
				</button>
			{/if}
		</div>

		<div class="voice-divider"></div>

		<div class="voice-members">
			{#if members.length === 0}
				<div class="voice-empty">
					<div class="voice-empty-icon">
						<Icon
							name="microphone-slash"
							variant="light"
						/>
					</div>

					<div class="voice-empty-text">
						<strong>Ninguém por aqui</strong>
						<span>
							Entre no canal para começar uma conversa.
						</span>
					</div>
				</div>
			{:else}
				{#each members as m (m.user_id)}
					{@const u = displayFor(m.user_id)}
					{@const isSpeaking =
						m.user_id === activeSpeaker && !m.muted}
					{@const roleColor =
						u?.roles.find(
							(r: RoleSummary) => r.color
						)?.color ?? null}
					{@const name =
						u?.nickname ||
						u?.username ||
						'Usuário'}

					<div
						class="voice-member"
						class:speaking={isSpeaking}
						class:me={m.user_id === me}
					>
						<button
							class="voice-member-profile"
							aria-label={u
								? `Ver perfil de ${name}`
								: undefined}
							onclick={() => {
								if (u) openProfile(u);
							}}
						>
							<span class="voice-avatar">
								<Avatar user={u} size={34} />

								{#if isSpeaking}
									<span
										class="speaking-ring"
									></span>
								{/if}
							</span>

							<span class="voice-member-main">
								<span
									class="voice-member-name"
									style={roleColor
										? `color:${roleColor}`
										: undefined}
								>
									{name}
								</span>

								{#if m.user_id === me}
									<span
										class="voice-me-label"
									>
										você
									</span>
								{/if}
							</span>
						</button>

						<div
							class="voice-member-state"
							class:muted={m.muted}
							class:speaking={isSpeaking}
							aria-label={m.muted
								? 'Microfone desativado'
								: isSpeaking
									? 'Falando'
									: 'Microfone ativo'}
						>
							{#if m.muted}
								<Icon
									name="microphone-slash"
									variant="light"
								/>
							{:else if isSpeaking}
								<Icon
									name="microphone-stage"
									variant="light"
								/>
							{:else}
								<Icon
									name="microphone"
									variant="light"
								/>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		{#if joined}
			<div class="voice-divider"></div>

			<div class="voice-controls">
				<button
					class="voice-btn"
					class:active={myMuted}
					onclick={toggleMute}
					aria-label={myMuted
						? 'Desativar microfone'
						: 'Ativar microfone'}
				>
					<Icon
						name={myMuted
							? 'microphone-slash'
							: 'microphone'}
						variant="light"
					/>

					<span>
						{myMuted ? 'Falar' : 'Mudo'}
					</span>
				</button>

				<button
					class="voice-btn danger"
					onclick={leave}
					aria-label="Sair da voz"
				>
					<Icon name="x" variant="light" />
					<span>Sair</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.voice-room {
		width: 100%;
		box-sizing: border-box;
		padding: 16px;
	}

	.voice-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;

		width: 100%;
		box-sizing: border-box;
		margin-bottom: 10px;
	}

	.voice-title {
		display: flex;
		align-items: center;
		gap: 7px;

		min-width: 0;
		margin: 0;

		color: var(--text);

		font-size: 15px;
		font-weight: 700;
	}

	.voice-title span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.voice-error {
		flex: 0 0 auto;

		color: var(--danger);

		font-size: 12px;
		font-weight: 600;
	}

	.voice-box {
		position: relative;

		width: 100%;
		box-sizing: border-box;

		overflow: hidden;

		border: 1px solid rgba(255, 255, 255, 0.78);
		border-radius: 18px;

		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.68) 0%,
				rgba(233, 246, 255, 0.48) 48%,
				rgba(204, 230, 247, 0.42) 100%
			);

		box-shadow:
			0 12px 30px rgba(28, 92, 132, 0.15),
			0 2px 6px rgba(28, 92, 132, 0.08),
			inset 0 1px 0 rgba(255, 255, 255, 0.95),
			inset 0 -1px 0 rgba(90, 160, 200, 0.12);

		backdrop-filter: blur(18px) saturate(145%);
		-webkit-backdrop-filter: blur(18px) saturate(145%);
	}

	.voice-box::before {
		content: '';

		position: absolute;
		z-index: 0;
		top: 0;
		left: 1px;
		right: 1px;

		height: 46%;

		border-radius: 17px 17px 50% 50%;

		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.42),
				rgba(255, 255, 255, 0.06)
			);

		pointer-events: none;
	}

	.voice-box-header {
		position: relative;
		z-index: 1;

		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;

		width: 100%;
		min-height: 54px;
		box-sizing: border-box;

		padding: 9px 10px 9px 12px;
	}

	.voice-status {
		display: flex;
		align-items: center;
		gap: 7px;

		min-width: 0;

		color: var(--muted-soft);

		font-size: 12px;
		font-weight: 600;
	}

	.voice-status > span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.voice-status-dot {
		width: 8px;
		height: 8px;
		flex: 0 0 8px;

		border-radius: 999px;

		background: rgba(110, 130, 145, 0.7);

		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.65),
			inset 0 1px 1px rgba(0, 0, 0, 0.18);
	}

	.voice-status-dot.connected {
		background: #5bc76d;

		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.7),
			0 0 8px rgba(91, 199, 109, 0.55);
	}

	.voice-divider {
		position: relative;
		z-index: 1;

		height: 1px;
		margin: 0 10px;

		background:
			linear-gradient(
				90deg,
				transparent,
				rgba(75, 135, 170, 0.22),
				rgba(255, 255, 255, 0.75),
				rgba(75, 135, 170, 0.22),
				transparent
			);
	}

	.voice-join-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;

		flex: 0 0 auto;

		min-height: 34px;
		box-sizing: border-box;

		padding: 7px 14px;

		border: 1px solid rgba(26, 113, 183, 0.55);
		border-radius: 11px;

	background: linear-gradient(
		180deg,
		#8ed2ff 0%,
		#68c0f6 28%,
		#3ea7e8 58%,
		#1687d4 82%,
		#0872be 100%
	);

		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.65),
			inset 0 -1px 0 rgba(0, 67, 130, 0.25),
			0 3px 8px rgba(19, 111, 174, 0.25);

		color: white;

		text-shadow: 0 1px 1px rgba(0, 70, 120, 0.45);

		font: inherit;
		font-size: 13px;
		font-weight: 700;

		cursor: pointer;

		transition:
			transform 120ms ease,
			filter 120ms ease,
			box-shadow 120ms ease;
	}

	.voice-join-btn:hover:not(:disabled) {
		filter: brightness(1.06);
		transform: translateY(-1px);

		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.8),
			inset 0 -1px 0 rgba(0, 67, 130, 0.25),
			0 5px 12px rgba(19, 111, 174, 0.32);
	}

	.voice-join-btn:active:not(:disabled) {
		transform: translateY(0);
		filter: brightness(0.97);
	}

	.voice-join-btn:disabled {
		opacity: 0.65;
		cursor: wait;
	}

	.voice-members {
		position: relative;
		z-index: 1;

		display: flex;
		flex-direction: column;
		gap: 4px;

		width: 100%;
		box-sizing: border-box;

		padding: 8px;
	}

	.voice-member {
		position: relative;

		display: flex;
		align-items: center;
		gap: 8px;

		width: 100%;
		min-width: 0;
		min-height: 46px;
		box-sizing: border-box;

		padding: 5px 7px 5px 6px;

		border: 1px solid transparent;
		border-radius: 11px;

		transition:
			background 120ms ease,
			border-color 120ms ease,
			box-shadow 120ms ease;
	}

	.voice-member:hover {
		border-color: rgba(255, 255, 255, 0.6);

		background: rgba(255, 255, 255, 0.4);
	}

	.voice-member.speaking {
		border-color: rgba(67, 168, 222, 0.48);

		background:
			linear-gradient(
				180deg,
				rgba(156, 225, 255, 0.42),
				rgba(78, 179, 233, 0.18)
			);

		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.65),
			0 0 0 1px rgba(77, 186, 238, 0.08),
			0 2px 8px rgba(45, 155, 210, 0.12);
	}

	.voice-member-profile {
		display: flex;
		align-items: center;
		gap: 9px;

		flex: 1 1 auto;

		width: 0;
		min-width: 0;
		min-height: 34px;

		margin: 0;
		padding: 0;

		border: 0;
		outline: 0;

		background: transparent;

		color: inherit;
		font: inherit;
		text-align: left;

		cursor: pointer;
	}

	.voice-member-profile:hover .voice-member-name {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}

	.voice-member-profile:focus-visible .voice-avatar {
		border-radius: 999px;

		box-shadow:
			0 0 0 2px rgba(255, 255, 255, 0.8),
			0 0 0 4px rgba(69, 168, 224, 0.55);
	}

	.voice-avatar {
		position: relative;

		display: flex;
		align-items: center;
		justify-content: center;

		width: 34px;
		height: 34px;
		flex: 0 0 34px;
	}

	.speaking-ring {
		position: absolute;
		inset: -3px;

		border: 2px solid #59c8f4;
		border-radius: 999px;

		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.7),
			0 0 7px rgba(50, 190, 241, 0.55);

		pointer-events: none;
	}

	.voice-member-main {
		display: flex;
		align-items: center;
		gap: 6px;

		flex: 1 1 auto;
		min-width: 0;
	}

	.voice-member-name {
		display: block;

		min-width: 0;

		overflow: hidden;

		color: var(--text);

		font-size: 13px;
		font-weight: 600;

		text-overflow: ellipsis;
		white-space: nowrap;

		transition:
			filter 120ms ease,
			text-shadow 120ms ease;
	}

	.voice-member.me .voice-member-name {
		font-weight: 750;
	}

	.voice-member.speaking .voice-member-name {
		text-shadow: 0 0 10px currentColor;
	}

	.voice-me-label {
		flex: 0 0 auto;

		padding: 2px 5px;

		border: 1px solid rgba(64, 151, 205, 0.18);
		border-radius: 999px;

		background: rgba(104, 190, 237, 0.13);

		color: var(--muted-soft);

		font-size: 9px;
		font-weight: 700;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.voice-member-state {
		display: flex;
		align-items: center;
		justify-content: center;

		width: 28px;
		height: 28px;
		flex: 0 0 28px;

		border-radius: 8px;

		background: rgba(255, 255, 255, 0.24);

		color: var(--muted-soft);

		pointer-events: none;
	}

	.voice-member-state.muted {
		color: var(--danger);
	}

	.voice-member-state.speaking {
		background: rgba(80, 191, 239, 0.15);

		color: #168bc9;
	}

	.voice-empty {
		display: flex;
		align-items: center;
		gap: 10px;

		width: 100%;
		box-sizing: border-box;

		padding: 12px 8px;

		color: var(--muted-soft);
	}

	.voice-empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;

		width: 34px;
		height: 34px;
		flex: 0 0 34px;

		border: 1px solid rgba(255, 255, 255, 0.65);
		border-radius: 10px;

		background: rgba(255, 255, 255, 0.35);

		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.75);
	}

	.voice-empty-text {
		display: flex;
		flex-direction: column;
		gap: 2px;

		min-width: 0;
	}

	.voice-empty-text strong {
		color: var(--text);

		font-size: 12px;
	}

	.voice-empty-text span {
		font-size: 11px;
	}

	.voice-controls {
		position: relative;
		z-index: 1;

		display: flex;
		align-items: center;
		gap: 7px;

		width: 100%;
		box-sizing: border-box;

		padding: 9px;
	}

	.voice-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;

		min-height: 34px;
		box-sizing: border-box;

		padding: 7px 12px;

		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 10px;

		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.72),
				rgba(214, 235, 247, 0.48)
			);

		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			0 2px 5px rgba(38, 100, 135, 0.1);

		color: var(--text);

		font: inherit;
		font-size: 12px;
		font-weight: 600;

		cursor: pointer;
	}

	.voice-btn:hover {
		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.9),
				rgba(214, 238, 251, 0.62)
			);
	}

	.voice-btn.active {
		border-color: rgba(75, 172, 224, 0.4);

		color: #167fc1;
	}

	.voice-btn.danger {
		margin-left: auto;

		color: var(--danger);
	}

	:global([data-theme='dark']) .voice-box {
		border-color: rgba(150, 213, 247, 0.18);

		background:
			linear-gradient(
				180deg,
				rgba(44, 89, 116, 0.68) 0%,
				rgba(25, 59, 82, 0.72) 52%,
				rgba(19, 43, 62, 0.78) 100%
			);

		box-shadow:
			0 14px 32px rgba(0, 0, 0, 0.28),
			inset 0 1px 0 rgba(211, 241, 255, 0.12),
			inset 0 -1px 0 rgba(0, 0, 0, 0.22);
	}

	:global([data-theme='dark']) .voice-box::before {
		background:
			linear-gradient(
				180deg,
				rgba(174, 226, 255, 0.09),
				transparent
			);
	}

	:global([data-theme='dark']) .voice-member:hover {
		border-color: rgba(134, 207, 244, 0.12);

		background: rgba(82, 166, 212, 0.13);
	}

	:global([data-theme='dark']) .voice-member.speaking {
		border-color: rgba(80, 193, 241, 0.32);

		background:
			linear-gradient(
				180deg,
				rgba(54, 171, 226, 0.25),
				rgba(28, 104, 144, 0.18)
			);
	}

	:global([data-theme='dark']) .voice-member-state,
	:global([data-theme='dark']) .voice-empty-icon {
		border-color: rgba(176, 225, 248, 0.1);

		background: rgba(132, 204, 240, 0.07);
	}

	:global([data-theme='dark']) .voice-btn {
		border-color: rgba(156, 213, 242, 0.14);

		background:
			linear-gradient(
				180deg,
					rgba(86, 151, 188, 0.2),
					rgba(32, 81, 109, 0.24)
			);

		box-shadow:
			inset 0 1px 0 rgba(215, 241, 255, 0.1),
			0 2px 5px rgba(0, 0, 0, 0.12);
	}

	:global([data-theme='dark']) .voice-btn:hover {
		background:
			linear-gradient(
				180deg,
				rgba(104, 179, 218, 0.27),
				rgba(42, 100, 132, 0.3)
			);
	}
</style>