<script lang="ts">
	import { api } from '$lib/api';
	import ServerIcon from '$lib/components/ServerIcon.svelte';
	import type { Server } from '$lib/types';

	const server: Promise<Server | null> = api.server.get();
</script>

<div class="auth-shell">
	<section class="brand-panel">
		{#await server}
			<!-- carregando -->
		{:then data}
			{#if data}
				<div class="brand">
					<div class="brand-mark" aria-hidden="true">
						<ServerIcon
							iconBlob={data.icon_blob}
							iconFormat={data.icon_format}
							name={data.name}
							size={34}
							dark
						/>
					</div>

					<div class="brand-copy">
						<h1>{data.name}</h1>
						<p>Comunidade de amigos</p>
					</div>
				</div>

		<div class="hero">
			<div class="hero-kicker">
				<i class="ph-light ph-sparkle" aria-hidden="true"></i>
				Chat de Texto/Voz/Vídeo • Tema Aero atualizado
			</div>

			<h2>Encontre sua turma</h2>

			<p>
				Servidor da comunidade {data.name}. UI feita utilizando Aero atualizado e moderno em Svelte.
			</p>
		</div>

		<div class="brand-footer">
			<span>
				<i class="ph-light ph-shield-check" aria-hidden="true"></i>
				conexão protegida
			</span>

			<span>
				<i class="ph-light ph-monitor" aria-hidden="true"></i>
				desktop &amp; mobile
			</span>
		</div>
		{/if}
		{:catch error}
			<p>Erro ao carregar servidor.</p>
	{/await}
	</section>

	<section class="auth-panel">
		<form class="auth-card">
			<slot />
		</form>
	</section>
</div>