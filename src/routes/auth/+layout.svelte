<script lang="ts">
	// Shared auth shell: brand panel + auth card (from LOGIN_PURO.html / auth.css).
</script>

<div class="auth-shell">
	<section class="brand-panel">
		<div class="brand">
			<div class="brand-mark">
				<i class="ph-duotone ph-users-three" aria-hidden="true"></i>
			</div>
			<div class="brand-copy">
				<h1>AeroClub</h1>
				<p>Comunidade de amigos e criadores</p>
			</div>
		</div>

		<div class="hero">
			<div class="hero-kicker">
				<i class="ph-light ph-sparkle" aria-hidden="true"></i>
				Liquid Glass • Aero atualizado
			</div>

			<h2>Entre no seu espaço.</h2>
			<p>
				Uma experiência inspirada no Aero clássico, reinterpretada com vidro
				líquido, profundidade, transparência e uma interface moderna.
			</p>
		</div>

		<div class="brand-footer">
			<span><i class="ph-light ph-shield-check" aria-hidden="true"></i> conexão protegida</span>
			<span><i class="ph-light ph-monitor" aria-hidden="true"></i> desktop &amp; mobile</span>
		</div>
	</section>

	<section class="auth-panel">
		<form class="auth-card">
			<slot />
		</form>
	</section>
</div>
