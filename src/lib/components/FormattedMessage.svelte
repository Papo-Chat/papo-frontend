<script lang="ts">
	import * as emojisStore from '$lib/store/emojis.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { openProfile } from '$lib/store/ui.svelte';
	import { emojiUrl } from '$lib/store/emojis.svelte';
	import { renderMessageMarkdown } from '$lib/utils/markdown';
	import { isGiphyMarker, resolveGiphyGif, type GiphyResolvedGif } from '$lib/utils/giphy';
	import type { Emoji } from '$lib/types';

	let {
		content,
		allowEveryoneHighlight = false,
		highlightText = ''
	} = $props<{
		content: string;
		allowEveryoneHighlight?: boolean;
		highlightText?: string;
	}>();

	let el: HTMLDivElement | null = null;
	const giphyId = $derived(isGiphyMarker(content));
	let giphy = $state<GiphyResolvedGif | null>(null);
	let giphyLoading = $state(false);
	let giphyError = $state('');

	// Mapa de nomes de emojis carregados -> emoji. Best-effort:
	// apenas os emojis já carregados (paginação lazy) são resolvidos.
	const nameMap = $derived(
		new Map<string, Emoji>(emojisStore.state.list.map((e) => [e.name, e]))
	);

	const mentionIds = $derived([...content.matchAll(/@mention\(<@([0-9a-fA-F-]{16,})>\)/g)].map((m) => m[1]));
	const mentionMap = $derived(new Map(mentionIds.map((id) => { const u = usersStore.state.byId.get(id); return [id, u?.nickname || u?.username || 'usuário'] as const; })));
	$effect(() => { if (mentionIds.length) void usersStore.ensureSummaries(mentionIds).catch(() => {}); });
	const html = $derived(giphyId ? '' : renderMessageMarkdown(content, nameMap, emojiUrl, { mentions: mentionMap, highlightEveryone: allowEveryoneHighlight }));

	function handleMentionClick(event: MouseEvent): void {
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mention-user-id]');
		const id = target?.dataset.mentionUserId;
		if (!id) return;
		const known = usersStore.state.byId.get(id);
		if (known) { openProfile(known); return; }
		void usersStore.ensureSummary(id).then((summary) => {
		if (summary) openProfile(summary);
	}).catch(() => {});
	}

	// O compilador trata `innerHTML` como atributo (não propriedade) quando o
	// valor é string; atribui o HTML gerado pelo parser via efeito.
	function applyTextHighlight(root: HTMLElement, query: string): void {
		const needle = query.trim();
		if (!needle) return;

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		const nodes: Text[] = [];
		let node: Node | null;
		while ((node = walker.nextNode())) {
			if (node.parentElement?.closest('mark.search-text-highlight')) continue;
			nodes.push(node as Text);
		}

		const lowerNeedle = needle.toLocaleLowerCase();
		for (const textNode of nodes) {
			const value = textNode.data;
			const lower = value.toLocaleLowerCase();
			if (!lower.includes(lowerNeedle)) continue;

			const fragment = document.createDocumentFragment();
			let cursor = 0;
			while (cursor < value.length) {
				const at = lower.indexOf(lowerNeedle, cursor);
				if (at < 0) {
					fragment.append(value.slice(cursor));
					break;
				}
				if (at > cursor) fragment.append(value.slice(cursor, at));
				const mark = document.createElement('mark');
				mark.className = 'search-text-highlight';
				mark.textContent = value.slice(at, at + needle.length);
				fragment.append(mark);
				cursor = at + needle.length;
			}
			textNode.replaceWith(fragment);
		}
	}

	$effect(() => {
		if (!giphyId) {
			giphy = null;
			giphyError = '';
			giphyLoading = false;
			return;
		}

		let cancelled = false;
		giphy = null;
		giphyError = '';
		giphyLoading = true;
		void resolveGiphyGif(giphyId)
			.then((resolved) => {
				if (!cancelled) giphy = resolved;
			})
			.catch(() => {
				if (!cancelled) giphyError = 'Não foi possível carregar este GIF.';
			})
			.finally(() => {
				if (!cancelled) giphyLoading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!el || giphyId) return;
		el.innerHTML = html;
		applyTextHighlight(el, highlightText);
	});
</script>

{#if giphyId}
	<div
		class="giphy-message"
		style={giphy ? `--giphy-width: ${Math.min(giphy.width || 420, 420)}px` : undefined}
	>
		{#if giphy}
			<img
				src={giphy.url}
				alt={giphy.title}
				loading="lazy"
			/>
			<div class="giphy-attribution">Powered by GIPHY</div>
		{:else if giphyLoading}
			<div class="giphy-status">Carregando GIF…</div>
		{:else}
			<div class="giphy-status">{giphyError || 'GIF indisponível.'}</div>
		{/if}
	</div>
{:else}
	<div class="msg-text" bind:this={el} onclick={handleMentionClick}></div>
{/if}

<style>
	.giphy-message {
		display: inline-flex;
		width: min(var(--giphy-width, 420px), calc(100vw - 112px));
		max-width: 420px;
		flex-direction: column;
		align-items: stretch;
	}

	.giphy-message img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 10px;
	}

	.giphy-attribution {
		margin-top: 4px;
		text-align: right;
		font-size: 10px;
		font-weight: 700;
		color: var(--muted-soft);
	}

	.giphy-status {
		font-size: 12px;
		color: var(--muted-soft);
	}

	.msg-text {
		width: 100%;
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
		-webkit-user-select: text;
		user-select: text;
		cursor: text;
	}

	:global(.msg-text :is(h1, h2, h3, h4, h5, h6)) {
		margin: 0.2em 0;
		font-weight: 700;
		line-height: 1.25;
	}

	:global(.msg-text h1) {
		font-size: 1.6em;
	}

	:global(.msg-text h2) {
		font-size: 1.4em;
	}

	:global(.msg-text h3) {
		font-size: 1.2em;
	}

	:global(.msg-text :is(h4, h5, h6)) {
		font-size: 1em;
	}

	:global(.msg-text p) {
		margin: 0.15em 0;
	}

	:global(.msg-text :is(ul, ol)) {
		margin: 0.15em 0;
		padding-left: 1.2em;
	}

	:global(.msg-text li) {
		margin: 0.05em 0;
	}

	:global(.msg-text blockquote) {
		margin: 0.15em 0;
		padding-left: 0.7em;
		border-left: 2px solid var(--line);
	}

	:global(.msg-text code) {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 0.9em;
	}

	/* Single backticks stay inline. */
	:global(.msg-text :not(pre) > code) {
		display: inline;
		padding: 0.08em 0.32em;
		border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
		border-radius: 5px;
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		color: var(--text-strong);
	}

	/* Triple backticks render as one full-width rectangular panel. */
	:global(.msg-text pre) {
		display: block;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		margin: 0.5em 0;
		padding: 0.8em 0.9em;
		box-sizing: border-box;
		border: 1px solid #b7cbd6;
		border-radius: 4px;
		background: #dce9ef;
		box-shadow: none;
		color: #142833;
		overflow-x: hidden;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	:global(.msg-text pre code) {
		display: block !important;
		width: 100% !important;
		min-width: 0;
		max-width: 100% !important;
		margin: 0 !important;
		padding: 0 !important;
		border: 0 !important;
		border-radius: 0 !important;
		background: transparent !important;
		box-shadow: none !important;
		color: inherit;
		white-space: inherit;
		overflow-wrap: inherit;
		word-break: inherit;
	}

	:global([data-theme='dark'] .msg-text pre) {
		border-color: #31505f;
		background: #091b25;
		color: #e9f5fa;
	}

	:global(.msg-text table) {
		margin: 0.15em 0;
		border-collapse: collapse;
	}

	:global(.msg-text :is(th, td)) {
		border: 1px solid var(--line);
		padding: 0.15em 0.5em;
	}

	:global(.msg-text hr) {
		margin: 0.3em 0;
		border: 0;
		border-top: 1px solid var(--line);
	}

	:global(.msg-text a) {
		color: var(--link);
	}

	:global(.inline-emoji) {
		display: inline;
		width: 1.6em;
		height: 1.6em;
		vertical-align: baseline;
		margin: 0 1px;
		border-radius: 4px;
	}

	:global(.full-emoji) {
		display: inline;
		width: 3em;
		height: 3em;
		vertical-align: baseline;
		margin: 0 1px;
		border-radius: 4px;
	}
	:global(.message-mention) { display: inline; padding: 0.06em 0.3em; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--link); font: inherit; font-weight: 650; cursor: pointer; }
	:global(.message-mention:hover) { background: color-mix(in srgb, var(--accent) 24%, transparent); text-decoration: underline; }
	:global(.message-mention-everyone) { cursor: default; text-decoration: none; }
	:global(.search-text-highlight) {
		padding: 0 0.08em;
		border-radius: 3px;
		background: color-mix(in srgb, var(--gold) 55%, transparent);
		color: inherit;
	}
</style>
