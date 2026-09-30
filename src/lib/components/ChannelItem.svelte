<script lang="ts">
	import type { Channel, VoiceState, RoleSummary } from '$lib/types';
	import { state as channelsState } from '$lib/store/channels.svelte';
	import { state as voiceState } from '$lib/store/voice.svelte';
	import { meId } from '$lib/store/session.svelte';
	import { openProfile } from '$lib/store/ui.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { parseChannelName } from '$lib/utils/channel-icon';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	let {
		channel,
		active = false,
		onSelect
	} = $props<{
		channel: Channel;
		active?: boolean;
		onSelect?: () => void;
	}>();

	const parsed = $derived(parseChannelName(channel.name));

	const icon = $derived(
		parsed.icon ?? (channel.type === 'voice' ? 'speaker-high' : 'chat')
	);

	const displayName = $derived(parsed.name || channel.name);

	const unread = $derived(
		channelsState.unread.get(channel.id)?.count ?? 0
	);

	const members = $derived<VoiceState[]>(
		channel.type === 'voice'
			? (voiceState.channelMembers.get(channel.id) ?? [])
			: []
	);

	const me = $derived(meId());

	function select(): void {
		onSelect?.();
	}
</script>

{#if channel.type === 'voice'}
	<div class="voice-channel">
		<button
			class="nav-item {active ? 'active' : ''}"
			onclick={select}
			aria-current={active ? 'page' : undefined}
			aria-label={`Canal de voz ${channel.name}`}
		>
			<span class="icon" aria-hidden="true">
				<Icon name={icon} variant="light" />
			</span>

			<strong>{displayName}</strong>

			{#if unread > 0}
				<span class="badge">{unread}</span>
			{/if}
		</button>

		{#if members.length > 0}
			<ul class="voice-members">
				{#each members as m (m.user_id)}
					{@const user = usersStore.state.byId.get(m.user_id)}
					{@const name = user?.nickname || user?.username || 'Usuário'}
					{@const roleColor =
						user?.roles.find((r: RoleSummary) => r.color)?.color ?? null}

					<li class="voice-member">
						<button
							class="voice-member-profile"
							aria-label={user ? `Ver perfil de ${name}` : undefined}
							disabled={!user}
							onclick={() => {
								if (user) openProfile(user);
							}}
						>
							<span class="voice-avatar">
								<Avatar {user} size={24} />
							</span>

							{#if user}
								<span
									class="voice-member-name"
									style={roleColor ? `color:${roleColor}` : undefined}
								>
									{m.user_id === me ? 'você' : name}
								</span>
							{/if}
						</button>

						{#if m.muted}
							<span
								class="voice-mute"
								aria-label="mudo"
							>
								<Icon
									name="microphone-slash"
									variant="light"
									size={18}
								/>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{:else}
	<button
		class="nav-item {active ? 'active' : ''}"
		onclick={select}
		aria-current={active ? 'page' : undefined}
	>
		<span class="icon" aria-hidden="true">
			<Icon name={icon} variant="light" />
		</span>

		<strong>{displayName}</strong>

		{#if channel.type !== 'category' && unread > 0}
			<span class="badge">{unread}</span>
		{/if}
	</button>
{/if}

<style>
	button.nav-item {
		font: inherit;
		text-align: left;
		-webkit-appearance: none;
		appearance: none;
	}

	button.nav-item strong {
		font-size: 14px;
		margin-left: 0;
	}

	.voice-channel {
		display: block;
	}

	.voice-members {
		display: flex;
		flex-direction: column;
		gap: 2px;

		margin: 0;
		padding: 2px 6px 5px 36px;

		list-style: none;
	}

	.voice-member {
		display: flex;
		align-items: center;

		width: 100%;
		height: 32px;
		min-width: 0;

		border-radius: 8px;

		color: var(--text);

		font-size: 13px;

		transition:
			background 120ms ease,
			box-shadow 120ms ease;
	}

	.voice-member-profile {
		display: flex;
		align-items: center;
		gap: 8px;

		flex: 1 1 auto;
		min-width: 0;
		height: 32px;

		margin: 0;
		padding: 0 4px;

		border: 0;
		outline: 0;

		background: transparent;

		color: inherit;

		font: inherit;
		text-align: left;

		cursor: pointer;

		-webkit-appearance: none;
		appearance: none;
	}

	.voice-member-profile:disabled {
		cursor: default;
	}

	.voice-avatar {
		display: flex;
		align-items: center;
		justify-content: center;

		width: 24px;
		height: 24px;
		flex: 0 0 24px;

		border-radius: 999px;

		transition:
			transform 120ms ease,
			filter 120ms ease,
			box-shadow 120ms ease;
	}

	.voice-member-name {
		min-width: 0;
		overflow: hidden;

		font-weight: 500;

		text-overflow: ellipsis;
		white-space: nowrap;

		transition:
			transform 120ms ease,
			filter 120ms ease,
	}

	.voice-member-profile:hover:not(:disabled) .voice-avatar {
		transform: scale(1.06);
		filter: brightness(1.08);

		box-shadow:
			0 2px 7px rgba(0, 0, 0, 0.13);
	}

	.voice-member-profile:hover:not(:disabled) .voice-member-name {
		transform: translateX(1px);
		filter: brightness(1.12);
	}

	.voice-member-profile:active:not(:disabled) .voice-avatar {
		transform: scale(0.96);
	}

	.voice-member-profile:active:not(:disabled) .voice-member-name {
		transform: translateX(0);
	}

	.voice-member-profile:focus-visible {
		border-radius: 7px;

		box-shadow:
			0 0 0 2px rgba(69, 168, 224, 0.45);
	}

	.voice-mute {
		display: flex;
		align-items: center;
		justify-content: center;

		flex: 0 0 auto;

		margin-left: auto;
		padding: 0 6px 0 2px;

		color: var(--muted-soft);

		opacity: 0.72;

		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.voice-member:hover .voice-mute {
		opacity: 1;
		transform: scale(1.04);
	}

</style>