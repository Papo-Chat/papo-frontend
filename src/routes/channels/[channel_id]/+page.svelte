<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as uiStore from '$lib/store/ui.svelte';
	import * as voiceStore from '$lib/store/voice.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { state as uiState, setScrollTarget } from '$lib/store/ui.svelte';
	import type { MessageWithAttachment, SearchResult } from '$lib/types';
	import Topbar from '$lib/components/Topbar.svelte';
	import Chat from '$lib/components/Chat.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import VoiceRoom from '$lib/components/VoiceRoom.svelte';

	// Resolve o canal da URL (id exato, depois nome). O guard garante resolvido.
	const channel = $derived(
		channelsStore.resolve(page.params.channel_id) ?? channelsStore.homeChannel()
	);

	const ch = $derived(channel && messagesStore.getChannel(channel.id));

	const messages = $derived(
		ch
			? (ch.ids.map((id) => ch.byId.get(id) ?? null).filter(Boolean) as MessageWithAttachment[])
			: []
	);

	let replyTo: MessageWithAttachment | null = $state(null);
	let searchQuery = $state('');
	let searchOpen = $state(false);
	let highlightMessageId: string | null = $state(null);

	const loading = $derived(!!ch && ch.loading);
	const hasMoreNewer = $derived(!!ch && ch.hasMoreNewer);

	// Carrega o histórico (latest 100) e as fixadas quando o canal muda.
	// `id` é a única dependência do efeito: as chamadas dos stores rodam em
	// `untrack()` porque cada uma lê+escreve o mesmo estado reativo — sem
	// isso, o efeito fica dependente daquele estado e o write re-ativa o
	// efeito em loop (freeze do canal).
	$effect(() => {
		const id = channel?.id;
		if (!id) return;
		untrack(() => {
			messagesStore.ensureLoaded(id);
			messagesStore.loadPinned(id);
			channelsStore.setOpen(id);
		});
	});

	// Carrega em batch os perfis dos usuários visíveis no canal — autores da
	// lista de mensagens (+ participantes de voz, em canais voice) — para a
	// cache `usersStore.state.profiles`, seedando `byId` com nome/roles/avatar.
	// O store só bate na API para ids ausentes do cache, então re-runs em cada
	// nova mensagem são baratos (sem fetch quando tudo já está cacheado).
	$effect(() => {
		const seen = new Set<string>();
		for (const m of messages) {
			if (m.author_id) seen.add(m.author_id);
		}
		if (channel?.type === 'voice') {
			for (const member of voiceStore.state.members) {
				if (member.user_id) seen.add(member.user_id);
			}
		}
		void usersStore.ensureProfiles([...seen]);
	});

	// Consume o scroll target global (definido por search/notifications/pins
	// de OUTRA rota antes da navegação).
	$effect(() => {
		const target = uiState.scrollToMessageId;
		if (!target) return;
		uiState.scrollToMessageId = null;
		if (channel && target === channel.id) return;
		if (ch) {
			// Só destaca se a mensagem existir no histórico carregado.
			const exists = ch.ids.some((id) => id === target);
			if (exists) {
				highlightMessageId = target;
				queueMicrotask(() => {
					setTimeout(() => {
						highlightMessageId = null;
					}, 2500);
				});
			}
		}
	});

	function sendText(text: string): Promise<void> {
		if (!channel) return Promise.resolve();
		return messagesStore
			.send({
				channel_id: channel.id,
				content: text,
				reply_to: replyTo?.id ?? null
			})
			.then((msg) => {
				// Reconcile the cache with the server response (canonical id /
				// created_at), so the local echo does not depend on the WS event.
				messagesStore.applySendResponse(channel.id, msg);
				replyTo = null;
			})
			.catch((err) => {
				// Keep the composed text + reply so the user can retry; the
				// Composer displays the error message.
				throw err;
			});
	}

	function onReply(msg: MessageWithAttachment): void {
		replyTo = msg;
	}

	function onReplyCancel(): void {
		replyTo = null;
	}

	function onSearchQueryChange(q: string): void {
		searchQuery = q;
	}

	function onSearchOpenChange(open: boolean): void {
		searchOpen = open;
	}

	function onSearchResult(result: SearchResult): void {
		const msgId = result.id;
		if (channel && result.channel_id === channel.id) {
			// Mesmo canal: destaca a mensagem localmente.
			const chState = messagesStore.getChannel(channel.id);
			const exists = chState?.ids.some((id) => id === msgId) ?? false;
			if (exists) {
				highlightMessageId = msgId;
				queueMicrotask(() => {
					setTimeout(() => {
						highlightMessageId = null;
					}, 2500);
				});
			}
		} else {
			// Outro canal: navega e destaca ali.
			setScrollTarget(msgId);
			goto(`/channels/${result.channel_id}`);
		}
	}
</script>

{#if channel}
	<Topbar
		{channel}
		{searchQuery}
		{searchOpen}
		{onSearchQueryChange}
		{onSearchOpenChange}
		{onSearchResult}
	/>

	{#if channel.type === 'voice'}
		<VoiceRoom {channel} />
	{:else}
		<Chat
			{messages}
			{onReply}
			searchActive={searchQuery.trim() !== ''}
			{loading}
			{hasMoreNewer}
			onJumpToLatest={() => messagesStore.setLatest(channel.id)}
			{highlightMessageId}
		/>
		<Composer
			onSend={sendText}
			channelId={channel.id}
			{replyTo}
			{onReplyCancel}
			disabled={!messagesStore.getChannel(channel.id)}
		/>
	{/if}
{:else}
	<div class="loading-fallback">
		<span>Carregando…</span>
	</div>
{/if}

<style>
	.loading-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--muted-soft);
		font-size: 14px;
	}
</style>
