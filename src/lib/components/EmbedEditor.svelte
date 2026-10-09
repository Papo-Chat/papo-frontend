<script lang="ts">
	// Formulário de embeds customizados (Composer e edição de mensagem).
	// `drafts` é bindable: o pai mantém a lista e a envia como `embeds`.
	import type { EmbedDraft, EmbedDraftField } from '$lib/utils/embeds';
	import { EMBED_LIMITS, EMBED_VIDEO_MIMES, emptyEmbedDraft } from '$lib/utils/embeds';
	import Icon from './Icon.svelte';

	let {
		drafts = $bindable<EmbedDraft[]>([]),
		max = EMBED_LIMITS.embedsPerMessage,
		disabled = false,
		title = 'Embeds'
	} = $props<{
		drafts?: EmbedDraft[];
		max?: number;
		disabled?: boolean;
		title?: string;
	}>();

	function patch(index: number, changes: Partial<EmbedDraft>): void {
		const list: EmbedDraft[] = drafts;
		drafts = list.map((draft, i) => (i === index ? { ...draft, ...changes } : draft));
	}

	function patchField(index: number, fieldIndex: number, changes: Partial<EmbedDraftField>): void {
		const list: EmbedDraft[] = drafts;
		drafts = list.map((draft, i) =>
			i === index
				? {
						...draft,
						fields: draft.fields.map((field, j) =>
							j === fieldIndex ? { ...field, ...changes } : field
						)
					}
				: draft
		);
	}

	function addEmbed(): void {
		if (drafts.length >= max) return;
		drafts = [...drafts, emptyEmbedDraft()];
	}

	function removeEmbed(index: number): void {
		const list: EmbedDraft[] = drafts;
		drafts = list.filter((_, i) => i !== index);
	}

	function addField(index: number): void {
		const draft = drafts[index];
		if (!draft || draft.fields.length >= EMBED_LIMITS.fieldsPerEmbed) return;
		patch(index, { fields: [...draft.fields, { name: '', value: '', inline: true }] });
	}

	function removeField(index: number, fieldIndex: number): void {
		const draft = drafts[index];
		if (!draft) return;
		const fields: EmbedDraftField[] = draft.fields;
		patch(index, { fields: fields.filter((_, j) => j !== fieldIndex) });
	}
</script>

<div class="embed-editor">
	<div class="editor-head">
		<span class="editor-title">{title}</span>
		<button
			type="button"
			class="editor-add"
			onclick={addEmbed}
			disabled={disabled || drafts.length >= max}
		>
			<Icon name="plus" variant="light" size={15} />
			Adicionar embed
		</button>
	</div>

	{#if drafts.length === 0}
		<p class="editor-empty">Nenhum embed customizado.</p>
	{/if}

	{#each drafts as draft, index (draft.id)}
		<section class="embed-form">
			<header class="embed-form-head">
				<span class="embed-form-index">Embed {index + 1}</span>
				<button
					type="button"
					class="embed-form-remove"
					aria-label={`Remover embed ${index + 1}`}
					onclick={() => removeEmbed(index)}
					{disabled}
				>
					<Icon name="trash" variant="light" size={15} />
				</button>
			</header>

			<div class="embed-fields">
				<label class="embed-field">
					<span>Título</span>
					<input
						type="text"
						maxlength={EMBED_LIMITS.title}
						value={draft.title}
						{disabled}
						oninput={(e) => patch(index, { title: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field">
					<span>Nome do site</span>
					<input
						type="text"
						maxlength={EMBED_LIMITS.siteName}
						value={draft.site_name}
						{disabled}
						oninput={(e) => patch(index, { site_name: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field span-2">
					<span>URL</span>
					<input
						type="url"
						maxlength={EMBED_LIMITS.url}
						placeholder="https://…"
						value={draft.url}
						{disabled}
						oninput={(e) => patch(index, { url: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field">
					<span>Cor</span>
					<input
						type="color"
						value={draft.color || '#0a84ff'}
						{disabled}
						oninput={(e) => patch(index, { color: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field">
					<span>Autor</span>
					<input
						type="text"
						maxlength={EMBED_LIMITS.author}
						value={draft.author_name}
						{disabled}
						oninput={(e) => patch(index, { author_name: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field span-2">
					<span>URL do autor</span>
					<input
						type="url"
						maxlength={EMBED_LIMITS.url}
						value={draft.author_url}
						{disabled}
						oninput={(e) => patch(index, { author_url: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field span-2">
					<span>Descrição</span>
					<textarea
						rows={3}
						maxlength={EMBED_LIMITS.description}
						value={draft.description}
						{disabled}
						oninput={(e) => patch(index, { description: e.currentTarget.value })}></textarea>
				</label>

				<label class="embed-field span-2">
					<span>Rodapé</span>
					<input
						type="text"
						maxlength={EMBED_LIMITS.footer}
						value={draft.footer_text}
						{disabled}
						oninput={(e) => patch(index, { footer_text: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field">
					<span>Imagem (URL)</span>
					<input
						type="url"
						maxlength={EMBED_LIMITS.url}
						placeholder="https://…"
						value={draft.thumbnail_url}
						{disabled}
						oninput={(e) => patch(index, { thumbnail_url: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field">
					<span>Vídeo (URL)</span>
					<input
						type="url"
						maxlength={EMBED_LIMITS.url}
						placeholder="https://…"
						value={draft.video_url}
						{disabled}
						oninput={(e) => patch(index, { video_url: e.currentTarget.value })}
					/>
				</label>

				<label class="embed-field">
					<span>MIME do vídeo</span>
					<select
						value={draft.video_mime}
						{disabled}
						onchange={(e) => patch(index, { video_mime: e.currentTarget.value })}
					>
						{#each EMBED_VIDEO_MIMES as mime}
							<option value={mime}>{mime}</option>
						{/each}
					</select>
				</label>
			</div>

			<p class="embed-hint">
				O backend baixa e re-serve a imagem: ela não volta preenchida ao editar a mensagem — informe
				a URL de novo para preservá-la.
			</p>

			<div class="embed-data-fields">
				<span class="embed-data-title">Fields</span>
				{#each draft.fields as field, fieldIndex (fieldIndex)}
					<div class="embed-data-row">
						<input
							type="text"
							placeholder="Nome"
							aria-label="Nome da field"
							maxlength={EMBED_LIMITS.fieldName}
							value={field.name}
							{disabled}
							oninput={(e) => patchField(index, fieldIndex, { name: e.currentTarget.value })}
						/>
						<input
							type="text"
							placeholder="Valor"
							aria-label="Valor da field"
							maxlength={EMBED_LIMITS.fieldValue}
							value={field.value}
							{disabled}
							oninput={(e) => patchField(index, fieldIndex, { value: e.currentTarget.value })}
						/>
						<label class="embed-inline">
							<input
								type="checkbox"
								checked={field.inline}
								{disabled}
								onchange={(e) => patchField(index, fieldIndex, { inline: e.currentTarget.checked })}
							/>
							lado a lado
						</label>
						<button
							type="button"
							class="embed-data-remove"
							aria-label="Remover field"
							onclick={() => removeField(index, fieldIndex)}
							{disabled}
						>
							<Icon name="x" variant="light" size={14} />
						</button>
					</div>
				{/each}
				<button
					type="button"
					class="embed-data-add"
					onclick={() => addField(index)}
					disabled={disabled || draft.fields.length >= EMBED_LIMITS.fieldsPerEmbed}
				>
					<Icon name="plus" variant="light" size={14} />
					Field
				</button>
			</div>
		</section>
	{/each}
</div>

<style>
	.embed-editor {
		display: grid;
		gap: 10px;
		min-width: 0;
	}
	.editor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.editor-title {
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.editor-add,
	.embed-data-add {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--text-strong);
		background: var(--glass);
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}
	.editor-add:disabled,
	.embed-data-add:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.editor-empty {
		margin: 0;
		color: var(--muted-soft);
		font-size: 12px;
	}

	.embed-form {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--glass-soft);
	}
	.embed-form-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.embed-form-index {
		color: var(--text-strong);
		font-size: 12px;
		font-weight: 800;
	}
	.embed-form-remove,
	.embed-data-remove {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 9px;
		color: var(--muted);
		background: transparent;
		cursor: pointer;
	}

	.embed-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 8px;
	}
	.embed-field {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.embed-field.span-2 {
		grid-column: 1 / -1;
	}
	.embed-field > span {
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.embed-field input,
	.embed-field textarea,
	.embed-field select {
		min-width: 0;
		padding: 7px 9px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--text);
		background: var(--glass-strong);
		font: inherit;
		font-size: 12px;
		outline: none;
	}
	.embed-field input[type='color'] {
		height: 34px;
		padding: 4px;
	}
	.embed-field textarea {
		resize: vertical;
	}
	.embed-hint {
		margin: 0;
		color: var(--muted-soft);
		font-size: 10px;
	}

	.embed-data-fields {
		display: grid;
		gap: 7px;
	}
	.embed-data-title {
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.embed-data-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto auto;
		align-items: center;
		gap: 7px;
	}
	.embed-data-row input[type='text'] {
		min-width: 0;
		padding: 7px 9px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--text);
		background: var(--glass-strong);
		font: inherit;
		font-size: 12px;
		outline: none;
	}
	.embed-inline {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--muted);
		font-size: 11px;
		white-space: nowrap;
	}
</style>
