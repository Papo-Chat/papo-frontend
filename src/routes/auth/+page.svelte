<script lang="ts">
	import AuthField from '$lib/components/AuthField.svelte';
	import Icon from '$lib/components/Icon.svelte';

	function login(): void {
		// No API wiring yet — placeholder for the auth flow.
	}
</script>

<div class="auth-top">
	<div class="auth-icon">
		<Icon name="sign-in" variant="duotone" />
	</div>
	<div class="auth-title">
		<h2>Entrar</h2>
		<p>Use suas credenciais para acessar o servidor.</p>
	</div>
</div>

<div class="form-grid">
	<AuthField label="Usuário" icon="user" placeholder="Seu usuário" />
	<AuthField label="Senha" icon="lock-key" type="password" placeholder="Sua senha" />

	<div class="field">
		<label>Senha do servidor</label>
		<div class="input-shell">
			<div class="input-icon"><Icon name="hard-drives" variant="light" /></div>
			<input
				type="password"
				placeholder="Senha de acesso ao servidor"
				aria-label="Senha de acesso ao servidor"
			/>
		</div>
		<div class="server-note">
			<i class="ph-light ph-info"></i>
			<span>Esta credencial identifica o servidor e é separada da senha da sua conta.</span>
		</div>
	</div>

	<button class="submit" type="button" onclick={login}>
		Entrar
		<i class="ph-light ph-arrow-right"></i>
	</button>

	<div class="auth-register">
		<span>Não tem conta?</span>
		<a href="/auth/register">Registre-se</a>
	</div>
</div>

<div class="auth-bottom">
	<span class="connection">
		<span class="connection-dot"></span>
		servidor disponível
	</span>
	<span>AeroClub Client V1</span>
</div>
