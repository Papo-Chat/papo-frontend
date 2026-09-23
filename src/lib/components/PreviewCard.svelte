<script lang="ts">
	import type { LinkPreview } from '$lib/types';

	let { preview } = $props<{ preview: LinkPreview }>();
</script>

<div class="preview-card">
	<div class="preview-title">{preview.title}</div>

	{#if preview.kind === 'dashboard'}
		<!-- Mockup dashboard preview (static). -->
		<div class="dashboard">
			<div class="dash-nav">
				<div class="dash-tab active">Dashboard</div>
				<div class="dash-tab">Atividade</div>
				<div class="dash-tab">Membros</div>
				<div class="dash-tab">Arquivos</div>
			</div>
			<div class="dash-body">
				<strong>Resumo da Comunidade</strong>
				<div class="kpis">
					<div class="kpi"><span>MEMBROS</span><strong>128</strong></div>
					<div class="kpi"><span>ONLINE</span><strong>42</strong></div>
					<div class="kpi"><span>MSG HOJE</span><strong>312</strong></div>
					<div class="kpi"><span>NOVOS</span><strong>18</strong></div>
				</div>
				<div class="dashboard-lower">
					<div class="panel">
						<strong>Atividade</strong>
						<div class="chart">
							<svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
								<defs>
									<linearGradient id="pc-line" x1="0" y1="0" x2="1" y2="1">
										<stop offset="0" stop-color="#49a0e7" stop-opacity="0.9"/>
										<stop offset="1" stop-color="#0a84ff" stop-opacity="0.9"/>
									</linearGradient>
								</defs>
								<path
									d="M0,46 C30,34 50,50 75,40 C100,30 120,44 150,34 C180,24 200,40 230,30 C260,20 280,36 300,28"
									fill="none"
									stroke="url(#pc-line)"
									stroke-width="2.5"
									stroke-linecap="round"
								/>
							</svg>
						</div>
					</div>
					<div class="panel">
						<strong>Última atividade</strong>
						<div class="activity-line"><span>Orion</span><span>2 min</span></div>
						<div class="activity-line"><span>Maya</span><span>10 min</span></div>
						<div class="activity-line"><span>Kael</span><span>15 min</span></div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Standard link preview. -->
		<div class="preview-body">
			{#if preview.description}
				<p>{preview.description}</p>
			{/if}
			{#if preview.provider_name}
				<span class="preview-provider">{preview.provider_name}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.preview-body{
		padding: 12px 14px;
	}
	.preview-body p{
		margin: 0;
		color: var(--text-strong);
		font-size: 13px;
	}
	.preview-provider{
		display: block;
		margin-top: 6px;
		font-size: 11px;
		color: var(--muted-soft);
	}
</style>
