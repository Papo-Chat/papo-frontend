<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthField from '$lib/components/AuthField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { api, ApiError } from '$lib/api';
	import * as healthStore from '$lib/store/health.svelte';

	let username = $state('');
	let password = $state('');
	let serverPassword = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function login(): Promise<void> {
		error = null;
		if (busy || healthStore.state.status !== 'online') {
			return;
		}
		busy = true;
		const healthy = await healthStore.check();
		if (!healthy) {
			error = 'Servidor indisponível no momento.';
			busy = false;
			return;
		}
		try {
			// A senha do servidor só é exigida quando o servidor existe e não
			// é público (GET /server é público; 404 → null → bootstrap, em que
			// caso o login segue normalmente).
			const server = await api.server.get();
			if (server && !server.public) {
				await api.auth.loginServer({ server_password: serverPassword });
			}
			await api.auth.login({ username, password });
		} catch (e) {
			error =
				e instanceof ApiError
					? e.detail
					: 'Erro ao entrar. Verifique sua conexão e tente novamente.';
		}
		busy = false;
		if (error) {
			return;
		}
		// Fora do try. `goto` faz navegação client-side: o load do rota "/"
		// roda o bootstrap canônico (whoami + WS + canais) e redireciona pro canal.
		// (redirect() lança um erro Redirect que, dentro de função async, não é
		// capturado pelo runtime e a navegação não ocorre.)
		goto('/');
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
	<AuthField label="Usuário" icon="user" placeholder="Seu usuário" bind:value={username} />
	<AuthField
		label="Senha"
		icon="lock-key"
		type="password"
		placeholder="Sua senha"
		bind:value={password}
	/>

	<div class="field">
		<label>Senha do servidor</label>
		<div class="input-shell">
			<div class="input-icon"><Icon name="hard-drives" variant="light" /></div>
			<input
				type="password"
				placeholder="Senha de acesso ao servidor"
				aria-label="Senha de acesso ao servidor"
				bind:value={serverPassword}
			/>
		</div>
		<div class="server-note">
			<i class="ph-light ph-info"></i>
			<span>Esta credencial identifica o servidor e é separada da senha da sua conta.</span>
		</div>
	</div>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<button
		class="submit"
		type="button"
		disabled={busy || healthStore.state.status !== 'online'}
		onclick={login}
	>
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
		<span
			class="connection-dot"
			class:connection-dot-offline={healthStore.state.status === 'offline'}
			class:connection-dot-checking={healthStore.state.status === 'checking'}
		></span>
		{healthStore.state.status === 'online'
			? 'servidor disponível'
			: healthStore.state.status === 'offline'
				? 'servidor indisponível'
				: 'verificando servidor…'}
	</span>
	<span>Papo Client V1</span>
</div>
