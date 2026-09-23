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
</script>

<Topbar channel={channel} />
<Chat messages={messages} />
<Composer onSend={addMessage} />
