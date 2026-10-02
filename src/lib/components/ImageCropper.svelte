<script lang="ts">
	import { onMount } from 'svelte';

	let {
		file,
		kind,
		onCancel,
		onConfirm
	} = $props<{
		file: File;
		kind: 'avatar' | 'banner';
		onCancel: () => void;
		onConfirm: (file: File) => void | Promise<void>;
	}>();

	let canvas: HTMLCanvasElement | null = null;
	let image: HTMLImageElement | null = null;
	let objectUrl = '';
	let zoom = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let busy = $state(false);
	let error = $state('');

	const width = $derived(kind === 'avatar' ? 512 : 1536);
	const height = $derived(kind === 'avatar' ? 512 : 512);

	function draw(): void {
		if (!canvas || !image) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		canvas.width = width;
		canvas.height = height;
		const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
		const scale = baseScale * zoom;
		const drawWidth = image.naturalWidth * scale;
		const drawHeight = image.naturalHeight * scale;
		const overflowX = Math.max(0, drawWidth - width);
		const overflowY = Math.max(0, drawHeight - height);
		const x = -overflowX * ((offsetX + 100) / 200);
		const y = -overflowY * ((offsetY + 100) / 200);

		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(image, x, y, drawWidth, drawHeight);
	}

	onMount(() => {
		objectUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			image = img;
			draw();
		};
		img.onerror = () => (error = 'Não foi possível abrir esta imagem.');
		img.src = objectUrl;
		return () => URL.revokeObjectURL(objectUrl);
	});

	$effect(() => {
		zoom;
		offsetX;
		offsetY;
		kind;
		queueMicrotask(draw);
	});

	async function confirm(): Promise<void> {
		if (!canvas || busy) return;
		busy = true;
		error = '';
		try {
			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas?.toBlob(
					(value) => (value ? resolve(value) : reject(new Error('Falha ao recortar imagem.'))),
					'image/png',
					0.92
				);
			});
			await onConfirm(new File([blob], `${kind}.png`, { type: 'image/png' }));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Falha ao recortar imagem.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="crop-backdrop" role="presentation" onclick={(e) => e.currentTarget === e.target && onCancel()}>
	<div class="crop-modal" role="dialog" aria-modal="true" aria-label="Recortar imagem">
		<h3>{kind === 'avatar' ? 'Ajustar avatar' : 'Ajustar capa'}</h3>
		<div class:avatar={kind === 'avatar'} class="crop-preview">
			<canvas bind:this={canvas}></canvas>
		</div>

		<label>
			Zoom
			<input type="range" min="1" max="3" step="0.01" bind:value={zoom} />
		</label>
		<label>
			Horizontal
			<input type="range" min="-100" max="100" step="1" bind:value={offsetX} />
		</label>
		<label>
			Vertical
			<input type="range" min="-100" max="100" step="1" bind:value={offsetY} />
		</label>

		{#if error}<p class="crop-error" role="alert">{error}</p>{/if}
		<div class="crop-actions">
			<button class="admin-btn ghost" type="button" onclick={onCancel} disabled={busy}>Cancelar</button>
			<button class="admin-btn" type="button" onclick={confirm} disabled={busy || !image}>
				{busy ? 'Aplicando…' : 'Usar imagem'}
			</button>
		</div>
	</div>
</div>

<style>
	.crop-backdrop { position:fixed; inset:0; z-index:3000; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.62); }
	.crop-modal { width:min(560px, 100%); padding:18px; border-radius:16px; background:var(--surface, #fff); box-shadow:0 24px 80px rgba(0,0,0,.35); display:grid; gap:14px; }
	.crop-modal h3 { margin:0; font-size:18px; }
	.crop-preview { width:100%; aspect-ratio:3/1; overflow:hidden; border-radius:12px; background:#111; }
	.crop-preview.avatar { width:min(360px, 80vw); aspect-ratio:1; border-radius:50%; justify-self:center; }
	canvas { display:block; width:100%; height:100%; }
	label { display:grid; grid-template-columns:90px 1fr; gap:10px; align-items:center; font-size:12px; }
	input[type='range'] { width:100%; }
	.crop-actions { display:flex; justify-content:flex-end; gap:8px; }
	.crop-error { margin:0; color:#c43a46; font-size:12px; }
</style>
