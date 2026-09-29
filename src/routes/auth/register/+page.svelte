<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthField from '$lib/components/AuthField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { api, ApiError } from '$lib/api';

	let username = $state('');
	let nickname = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	async function register(): Promise<void> {
		error = null;
		if (busy) {
			return;
		}
		busy = true;
		try {
			if (password !== confirmPassword) {
				throw new Error('As senhas não coincidem.');
			}
			await api.auth.register({ username, password });

			// O registro não cria sessão; loga para persistir via cookie e
			// continuar o fluxo até / (bootstrap canônico no raiz).
			const login = await api.auth.login({ username, password });

			// O API de registro não aceita apelido; persiste via perfil logo
			// após a sessão existir. `status` aqui é a mensagem de status
			// (users.status_message), não o status online — vazio = neutro.
			if (nickname) {
				await api.users.update(login.user.id, {
					nickname,
					status: '',
					description: '',
					typing: null
				});
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erro ao registrar a conta. Tente novamente.';
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
		label="Apelido"
		icon="user"
		placeholder="Como quer ser chamado"
		bind:value={nickname}
	/>
	<AuthField
		label="Senha"
		icon="lock-key"
		type="password"
		placeholder="Sua senha"
		bind:value={password}
	/>

	<div class="field">
		<label>Confirmar senha</label>
		<div class="input-shell">
			<div class="input-icon"><Icon name="lock-key" variant="light" /></div>
			<input
				type="password"
				placeholder="Confirme sua senha"
				aria-label="Confirmar senha"
				bind:value={confirmPassword}
			/>
		</div>
	</div>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}

	<button class="submit" type="button" disabled={busy} onclick={register}>
		Criar conta
		<i class="ph-light ph-arrow-right"></i>
	</button>
</div>

<div class="auth-bottom">
	<span class="connection">
		<span class="connection-dot"></span>
		servidor disponível
	</span>
	<span>Papo Client V1</span>
</div>
