<script lang="ts">
	// Edit own profile. Demo only — local state seeded from sampleMe.
	import { sampleMe } from '$lib/sample';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	let nickname = $state(sampleMe.nickname ?? '');
	let statusMessage = $state(sampleMe.status_message ?? '');
	let description = $state('');
	let saved = $state(false);
</script>

<div class="profile-edit-page">
	<div class="profile-edit-card">
		<div class="profile-preview">
			<Avatar username={sampleMe.username} nickname={nickname} size={64} />
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
