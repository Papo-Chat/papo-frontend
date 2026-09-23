<script lang="ts">
	// Edit own profile. Demo only — local state seeded from sampleMe.
	import { sampleMe } from '$lib/sample';
	import { fileToBase64 } from '$lib/utils/upload';
	import { blobToUrl, mimeToFormat } from '$lib/utils/media';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	let nickname = $state(sampleMe.nickname ?? '');
	let statusMessage = $state(sampleMe.status_message ?? '');
	let description = $state('');
	let saved = $state(false);

	// Avatar / banner uploads (demo: stored as base64, previewed via objectURL).
	let avatarImg = $state<{ base64: string; mime: string } | null>(null);
	let bannerImg = $state<{ base64: string; mime: string } | null>(null);
	let avatarError = $state('');
	let bannerError = $state('');

	const avatarSrc = $derived(
		avatarImg ? blobToUrl(avatarImg.base64, mimeToFormat(avatarImg.mime)) : ''
	);
	const bannerSrc = $derived(
		bannerImg ? blobToUrl(bannerImg.base64, mimeToFormat(bannerImg.mime)) : ''
	);

	async function onAvatarSelect(e: Event) {
		avatarError = '';
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			avatarImg = await fileToBase64(file, 'avatar');
		} catch (err) {
			avatarError = (err as Error).message;
			avatarImg = null;
		}
	}

	async function onBannerSelect(e: Event) {
		bannerError = '';
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			bannerImg = await fileToBase64(file, 'banner');
		} catch (err) {
			bannerError = (err as Error).message;
			bannerImg = null;
		}
	}

	function resetAvatar(): void {
		avatarImg = null;
		avatarError = '';
	}

	function resetBanner(): void {
		bannerImg = null;
		bannerError = '';
	}
</script>

<div class="profile-edit-page">
	<div class="profile-edit-card">
		{#if bannerSrc}
			<div class="profile-banner-preview">
				<img src={bannerSrc} alt="" />
				<button class="banner-reset" onclick={resetBanner} aria-label="Remover capa">
					<Icon name="x" variant="light" size={14} />
				</button>
			</div>
		{/if}

		<div class="profile-preview">
			{#if avatarSrc}
				<img
					class="avatar avatar-custom"
					src={avatarSrc}
					alt="{nickname || sampleMe.username}"
				/>
			{:else}
				<Avatar username={sampleMe.username} nickname={nickname} size={64} />
			{/if}
			<div class="profile-preview-info">
				<h3>{nickname || sampleMe.username}</h3>
				<span class="preview-user">@{sampleMe.username}</span>
				<span class="preview-status">
					{#if statusMessage}{statusMessage}{:else}Online{/if}
				</span>
			</div>
		</div>

		<div class="profile-form">
			<div class="admin-field">
				<label for="pf-name">Nome</label>
				<input id="pf-name" class="admin-input" bind:value={nickname} placeholder="Como você quer ser chamado" />
			</div>
			<div class="admin-field">
				<label for="pf-status">Mensagem de status</label>
				<input id="pf-status" class="admin-input" bind:value={statusMessage} placeholder="ex.: online, ocupado, em férias…" maxlength="80" />
			</div>
			<div class="admin-field">
				<label for="pf-desc">Descrição</label>
				<textarea
					id="pf-desc"
					class="admin-textarea"
					bind:value={description}
					placeholder="Sobre você, seus interesses, seu papel no AeroClub…"
				></textarea>
			</div>
			<div class="admin-field">
				<label>Avatar</label>
				<input
					type="file"
					accept="image/*"
					onchange={onAvatarSelect}
					aria-label="Escolher avatar"
				/>
				{#if avatarError}
					<span class="field-error">{avatarError}</span>
				{/if}
			</div>
			<div class="admin-field">
				<label>Capa</label>
				<input
					type="file"
					accept="image/*"
					onchange={onBannerSelect}
					aria-label="Escolher capa"
				/>
				{#if bannerError}
					<span class="field-error">{bannerError}</span>
				{/if}
			</div>
			<div class="profile-actions">
				<button class="admin-btn" onclick={() => { saved = true; }}>
					<Icon name="check" variant="light" />
					Salvar
				</button>
				{#if saved}
					<span class="saved">Perfil salvo</span>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.profile-edit-page {
		padding: 4px 0 8px;
	}
	.profile-edit-card {
		max-width: 620px;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 18px;
		align-items: start;
		background: linear-gradient(145deg, rgba(255, 255, 255, 0.48), rgba(239, 248, 252, 0.27));
		border: 1px solid rgba(255, 255, 255, 0.58);
		border-radius: 14px;
		padding: 18px;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84), 0 10px 22px rgba(28, 82, 116, 0.08);
	}
	.profile-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.profile-preview-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		text-align: center;
	}
	.profile-preview-info h3 {
		margin: 0;
		font-size: 16px;
	}
	.preview-user {
		font-size: 12px;
		color: var(--muted);
	}
	.preview-status {
		font-size: 12px;
		color: var(--muted-soft);
		max-width: 220px;
	}
	.avatar.avatar-custom {
		border: 2px solid rgba(255, 255, 255, 0.84);
		border-radius: 50%;
		display: block;
		width: 64px;
		height: 64px;
		object-fit: cover;
	}
	.profile-banner-preview {
		position: relative;
		width: 100%;
		height: 120px;
		border-radius: 12px;
		overflow: hidden;
		background: linear-gradient(120deg, #0a84ff, #5ac8fa, #30d158);
		margin-bottom: 14px;
	}
	.profile-banner-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.banner-reset {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.5);
		display: grid;
		place-items: center;
		color: var(--text);
		cursor: pointer;
		transition: transform 0.18s var(--ease);
	}
	.banner-reset:hover {
		transform: translateY(-1px);
	}
	.field-error {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: #e74c5f;
	}
	.profile-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 4px;
	}
	.saved {
		font-size: 12px;
		font-weight: 700;
		color: #24c982;
	}
	@media (max-width: 640px) {
		.profile-edit-card {
			grid-template-columns: 1fr;
		}
	}
</style>
