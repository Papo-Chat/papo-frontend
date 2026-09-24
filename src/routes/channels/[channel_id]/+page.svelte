<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import { page } from '$app/state';
	import { resolveChannel, sampleMe, sampleMessages } from '$lib/sample';
	import Topbar from '$lib/components/Topbar.svelte';
	import Chat from '$lib/components/Chat.svelte';
	import Composer from '$lib/components/Composer.svelte';

	// Resolve the channel once so messages + Topbar agree on the canonical
	// channel id (id or name in the URL).
	const channel = $derived(resolveChannel(page.params.channel_id));

	let messages: MessageWithAttachment[] = $state(
		sampleMessages.filter((m) => m.channel_id === channel.id)
	);

	// Reset to the channel's sample messages when the channel changes.
	$effect(() => {
		messages = sampleMessages.filter((m) => m.channel_id === channel.id);
	});

	let searchQuery = $state('');
	let searchOpen = $state(false);

	// Search filters messages by content (demo only).
	const filteredMessages = $derived(
		messages.filter((m) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			return (m.content ?? '').toLowerCase().includes(q);
		})
	);

	function onSearchQueryChange(q: string): void {
		searchQuery = q;
	}

	function onSearchOpenChange(open: boolean): void {
		searchOpen = open;
	}

	function addMessage(text: string): void {
		messages.push({
			id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			channel_id: channel.id,
			author_id: sampleMe.id,
			content: text,
			created_at: new Date().toISOString(),
			edited_at: null,
			reply_to: null,
			attachments: [],
			previews: [],
			reactions: [],
			user_reactions: []
		});
	}

	// Demo: add a reaction locally (no API wiring yet).
	function addReaction(messageId: string, emoji: string): void {
		const idx = messages.findIndex((m) => m.id === messageId);
		if (idx === -1) return;
		const msg = messages[idx];
		const already = msg.reactions.find((r) => r.unicode === emoji);
		const nextReactions = already
			? msg.reactions.map((r) => (r.unicode === emoji ? { ...r, count: r.count + 1 } : r))
			: [...msg.reactions, { emoji_id: '', unicode: emoji, count: 1 }];
		const alreadyUser = msg.user_reactions.find((ur) => ur.unicode === emoji);
		const nextUserReactions = alreadyUser
			? msg.user_reactions
			: [
					...msg.user_reactions,
					{
						id: `ur-${Date.now()}-${Math.random().toString(36).slice(2)}`,
						emoji_id: '',
						unicode: emoji
					}
				];
		messages[idx] = { ...msg, reactions: nextReactions, user_reactions: nextUserReactions };
	}
</script>

<Topbar {channel} {searchQuery} {searchOpen} {onSearchQueryChange} {onSearchOpenChange} />
<Chat
	messages={filteredMessages}
	searchActive={searchQuery.trim() !== ''}
	onAddReaction={addReaction}
/>
<Composer onSend={addMessage} />
