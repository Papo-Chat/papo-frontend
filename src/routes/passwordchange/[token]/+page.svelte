<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import { isValidPassword, minPasswordLength } from '$lib/utils/password';

	const token = $derived(page.params.token ?? '');
	let password = $state('');
	let confirmPassword = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	const passwordCheck = $derived(isValidPassword(password));

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		error = null;

		if (!token) {
			error = 'Link inválido.';
			return;
		}
		if (!passwordCheck.ok) {
			error = passwordCheck.errors[0] ?? 'Senha inválida.';
			return;
		}
		if (password !== confirmPassword) {
			error = 'As senhas não coincidem.';
			return;
		}

		busy = true;
		try {
			await api.auth.consumePasswordReset(token, password);
			await goto('/auth');
		} catch (err) {
			error = err instanceof ApiError ? err.detail : 'Não foi possível alterar a senha.';
		} finally {
			busy = false;
		}
	}
</script>

<main class="password-change-page">
	<form class="password-card" onsubmit={submit}>
		<div class="password-icon"><Icon name="key" variant="duotone" size={26} /></div>
		<div>
			<h1>Trocar senha</h1>
			<p>Defina uma nova senha para sua conta.</p>
		</div>

		<label>
			Nova senha
			<input class="admin-input" type="password" bind:value={password} autocomplete="new-password" autofocus />
		</label>

		<div class="password-rules" aria-live="polite">
			<span class:ok={password.length >= minPasswordLength}>✓ {minPasswordLength}+ caracteres</span>
			<span class:ok={/[A-Z]/.test(password)}>✓ 1 letra maiúscula</span>
			<span class:ok={/[^A-Za-z0-9]/.test(password)}>✓ 1 caractere especial</span>
		</div>

		<label>
			Confirmar nova senha
			<input class="admin-input" type="password" bind:value={confirmPassword} autocomplete="new-password" />
		</label>

		{#if error}
			<div class="password-error" role="alert">{error}</div>
		{/if}

		<button
			class="admin-btn submit-password"
			type="submit"
			disabled={busy || !passwordCheck.ok || password !== confirmPassword}
		>
			{busy ? 'Alterando…' : 'Alterar senha'}
		</button>
	</form>
</main>

<style>
	.password-change-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 20px;
		box-sizing: border-box;
	}
	.password-card {
		width: min(420px, 100%);
		display: grid;
		gap: 14px;
		padding: 24px;
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.16);
	}
	.password-card h1 { margin: 0; font-size: 21px; }
	.password-card p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
	.password-icon {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 13px;
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--accent);
	}
	label { display: grid; gap: 6px; font-size: 12px; font-weight: 650; }
	.password-rules { display:flex; flex-wrap:wrap; gap:6px 12px; font-size:12px; color:var(--muted-soft); }
	.password-rules span.ok { color:#24a46d; }
	.password-error {
		padding: 9px 11px;
		border-radius: 10px;
		background: rgba(220, 40, 40, 0.1);
		color: #c43a46;
		font-size: 12px;
	}
	.submit-password { width: 100%; justify-content: center; }
</style>
