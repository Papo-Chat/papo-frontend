<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthField from '$lib/components/AuthField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { api, ApiError } from '$lib/api';
	import * as healthStore from '$lib/store/health.svelte';

	let username = $state('');
	let password = $state('');
	let serverPassword = $state('');
	let confirmPassword = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

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

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<button
		class="submit"
		type="button"
		disabled={busy || healthStore.state.status !== 'online'}
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
