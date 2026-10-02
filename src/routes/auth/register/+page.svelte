<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthField from '$lib/components/AuthField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { api, ApiError } from '$lib/api';
	import * as healthStore from '$lib/store/health.svelte';
	import { isValidPassword, minPasswordLength } from '$lib/utils/password';

	let username = $state('');
	let password = $state('');
	let serverPassword = $state('');
	let confirmPassword = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	const passwordCheck = $derived(isValidPassword(password));
	const usernameValid = $derived(username.trim().length >= 3);

	async function register(): Promise<void> {
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
			if (!usernameValid) {
				throw new Error('O usuário deve ter no mínimo 3 caracteres.');
			}
			if (!passwordCheck.ok) {
				throw new Error(passwordCheck.errors[0] ?? 'Senha inválida.');
			}
			if (password !== confirmPassword) {
				throw new Error('As senhas não coincidem.');
			}

			// Servidores privados exigem uma autorização temporária antes de
			// /auth/register. Sem isso o backend rejeita o registro antes de
			// criar o usuário.
			const server = await api.server.get();
			if (server && !server.public) {
				if (!serverPassword) {
					throw new Error('Informe a senha do servidor.');
				}
				await api.auth.loginServer({ server_password: serverPassword });
			}

			await api.auth.register({ username, password });

			// O registro não cria sessão permanente; faz login imediatamente
			// para concluir o cadastro em um único fluxo.
			await api.auth.login({ username, password });
		} catch (e) {
			error =
				e instanceof ApiError
					? e.detail
					: e instanceof Error
						? e.message
						: 'Erro ao registrar a conta. Tente novamente.';
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
		<Icon name="user-plus" variant="duotone" />
	</div>
	<div class="auth-title">
		<h2>Criar conta</h2>
		<p>Comece a participar da comunidade.</p>
	</div>
</div>

<div class="form-grid">
	<AuthField label="Usuário" icon="user" placeholder="Seu usuário" bind:value={username} />
	<AuthField
		label="Senha da conta"
		icon="lock-key"
		type="password"
		placeholder="Sua senha"
		bind:value={password}
	/>

	<div class="password-rules" aria-live="polite">
		<span class:ok={password.length >= minPasswordLength}>✓ {minPasswordLength}+ caracteres</span>
		<span class:ok={/[A-Z]/.test(password)}>✓ 1 letra maiúscula</span>
		<span class:ok={/[^A-Za-z0-9]/.test(password)}>✓ 1 caractere especial</span>
	</div>

	<div class="field">
		<label>Confirmar senha da conta</label>
		<div class="input-shell">
			<div class="input-icon"><Icon name="lock-key" variant="light" /></div>
			<input
				type="password"
				placeholder="Confirme a senha da sua conta"
				aria-label="Confirmar senha da conta"
				bind:value={confirmPassword}
			/>
		</div>
	</div>

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
			<span>Necessária apenas quando o servidor for privado.</span>
		</div>
	</div>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<button
		class="submit"
		type="button"
		disabled={busy || healthStore.state.status !== 'online' || !usernameValid || !passwordCheck.ok || password !== confirmPassword}
		onclick={register}
	>
		Criar conta
		<i class="ph-light ph-arrow-right"></i>
	</button>

	<div class="auth-register">
		<span>Já tem conta?</span>
		<a href="/auth">Voltar para o login</a>
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

<style>
	.password-rules { display:flex; flex-wrap:wrap; gap:6px 12px; font-size:12px; color:var(--muted-soft); margin-top:-4px; }
	.password-rules span.ok { color:#24a46d; }
</style>
