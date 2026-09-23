<script lang="ts">
	import AuthField from '$lib/components/AuthField.svelte';
	import Icon from '$lib/components/Icon.svelte';

	function register(): void {
		// No API wiring yet — placeholder for the register flow.
	}
</script>

<div class="auth-top">
	<div class="auth-icon">
		<Icon name="user-plus" variant="duotone" />
	</div>
	<div class="auth-title">
		<h2>Criar conta</h2>
		<p>Comece a participar da comunidade.</p>
	</div>
</div>

<div class="form-grid">
	<AuthField label="Usuário" icon="user" placeholder="Seu usuário" />
	<AuthField label="Apelido" icon="user" placeholder="Como quer ser chamado" />
	<AuthField label="Senha" icon="lock-key" type="password" placeholder="Sua senha" />

	<div class="field">
		<label>Confirmar senha</label>
		<div class="input-shell">
			<div class="input-icon"><Icon name="lock-key" variant="light" /></div>
			<input
				type="password"
				placeholder="Confirme sua senha"
				aria-label="Confirmar senha"
			/>
		</div>
	</div>

	<button class="submit" type="button" onclick={register}>
		Criar conta
		<i class="ph-light ph-arrow-right"></i>
	</button>
</div>

<div class="auth-bottom">
	<span class="connection">
		<span class="connection-dot"></span>
		servidor disponível
	</span>
	<span>AeroClub Client V1</span>
</div>
