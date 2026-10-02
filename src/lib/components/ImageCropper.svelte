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
	let raf = 0;

	let zoom = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let dragging = $state(false);
	let busy = $state(false);
	let error = $state('');

	let dragPointerId: number | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartOffsetX = 0;
	let dragStartOffsetY = 0;

	const width = $derived(kind === 'avatar' ? 512 : 1536);
	const height = $derived(kind === 'avatar' ? 512 : 512);

	function clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	function cropMetrics() {
		if (!image) return null;
		const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
		const scale = baseScale * zoom;
		const drawWidth = image.naturalWidth * scale;
		const drawHeight = image.naturalHeight * scale;
		return {
			drawWidth,
			drawHeight,
			overflowX: Math.max(0, drawWidth - width),
			overflowY: Math.max(0, drawHeight - height)
		};
	}

	function draw(): void {
		if (!canvas || !image) return;
		const ctx = canvas.getContext('2d');
		const metrics = cropMetrics();
		if (!ctx || !metrics) return;

		canvas.width = width;
		canvas.height = height;

		const x = -metrics.overflowX * ((offsetX + 100) / 200);
		const y = -metrics.overflowY * ((offsetY + 100) / 200);

		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(image, x, y, metrics.drawWidth, metrics.drawHeight);
	}

	function scheduleDraw(): void {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			draw();
		});
	}

	function beginDrag(event: PointerEvent): void {
		if (!image || busy) return;

		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartOffsetX = offsetX;
		dragStartOffsetY = offsetY;
		dragging = true;
		event.preventDefault();
	}

	function moveDrag(event: PointerEvent): void {
		if (!dragging || event.pointerId !== dragPointerId || !image) return;

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const metrics = cropMetrics();
		if (!metrics || rect.width <= 0 || rect.height <= 0) return;

		const renderedOverflowX = metrics.overflowX * (rect.width / width);
		const renderedOverflowY = metrics.overflowY * (rect.height / height);

		if (renderedOverflowX > 0) {
			offsetX = clamp(
				dragStartOffsetX - ((event.clientX - dragStartX) / renderedOverflowX) * 200,
				-100,
				100
			);
		}
		if (renderedOverflowY > 0) {
			offsetY = clamp(
				dragStartOffsetY - ((event.clientY - dragStartY) / renderedOverflowY) * 200,
				-100,
				100
			);
		}
		event.preventDefault();
	}

	function endDrag(event: PointerEvent): void {
		if (event.pointerId !== dragPointerId) return;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
		dragPointerId = null;
		dragging = false;
	}

	function resetCrop(): void {
		zoom = 1;
		offsetX = 0;
		offsetY = 0;
	}

	onMount(() => {
		objectUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			image = img;
			scheduleDraw();
		};
		img.onerror = () => (error = 'Não foi possível abrir esta imagem.');
		img.src = objectUrl;

		return () => {
			URL.revokeObjectURL(objectUrl);
			if (raf) cancelAnimationFrame(raf);
		};
	});

	$effect(() => {
		zoom;
		offsetX;
		offsetY;
		kind;
		scheduleDraw();
	});

	async function confirm(): Promise<void> {
		if (!canvas || !image || busy) return;
		busy = true;
		error = '';
		try {
			draw();
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

<div
	class="crop-backdrop"
	role="presentation"
	onclick={(event) => event.currentTarget === event.target && onCancel()}
>
	<div class="crop-modal" role="dialog" aria-modal="true" aria-label="Recortar imagem">
		<div class="crop-header">
			<div>
				<h3>{kind === 'avatar' ? 'Ajustar avatar' : 'Ajustar capa'}</h3>
				<p>Arraste a imagem para escolher o enquadramento.</p>
			</div>
			<button class="crop-close" type="button" onclick={onCancel} aria-label="Fechar">×</button>
		</div>

		<div
			class="crop-preview"
			class:avatar-mode={kind === 'avatar'}
			class:dragging
			role="application"
			aria-label="Área de recorte. Arraste a imagem para reposicionar."
			onpointerdown={beginDrag}
			onpointermove={moveDrag}
			onpointerup={endDrag}
			onpointercancel={endDrag}
			ondblclick={resetCrop}
		>
			<canvas bind:this={canvas}></canvas>
			<div class="crop-outline" aria-hidden="true"></div>
		</div>

		<div class="drag-hint">Arraste para reposicionar · clique duas vezes para centralizar</div>

		<div class="crop-controls">
			<label>
				<span>Zoom</span>
				<input type="range" min="1" max="3" step="0.01" bind:value={zoom} />
			</label>
		</div>

		{#if error}<p class="crop-error" role="alert">{error}</p>{/if}

		<div class="crop-actions">
			<button class="crop-button secondary" type="button" onclick={onCancel} disabled={busy}>
				Cancelar
			</button>
			<button class="crop-button primary" type="button" onclick={confirm} disabled={busy || !image}>
				{busy ? 'Aplicando…' : 'Usar imagem'}
			</button>
		</div>
	</div>
</div>

<style>
	.crop-backdrop {
		position: fixed;
		inset: 0;
		z-index: 3000;
		display: grid;
		place-items: center;
		padding: 20px;
		box-sizing: border-box;
		background: rgba(4, 16, 27, 0.7);
	}

	.crop-modal {
		width: min(520px, 100%);
		max-height: calc(100dvh - 40px);
		overflow-y: auto;
		box-sizing: border-box;
		padding: 18px;
		display: grid;
		gap: 12px;
		color: var(--text-primary, var(--text));
		background:
			radial-gradient(circle at 18% -12%, rgba(255, 255, 255, 0.2), transparent 38%),
			var(--surface, #f7fbfe);
		border: 1px solid var(--border, rgba(70, 120, 150, 0.24));
		border-radius: 18px;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
	}

	.crop-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		min-width: 0;
	}

	.crop-header h3 {
		margin: 0;
		font-size: 18px;
	}

	.crop-header p {
		margin: 4px 0 0;
		color: var(--muted, #62798a);
		font-size: 12px;
		line-height: 1.45;
	}

	.crop-close {
		width: 32px;
		height: 32px;
		flex: 0 0 32px;
		padding: 0;
		border: 1px solid var(--border, rgba(70, 120, 150, 0.24));
		border-radius: 10px;
		background: var(--surface-2, rgba(255, 255, 255, 0.5));
		color: inherit;
		font: inherit;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}

	.crop-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 3 / 1;
		justify-self: center;
		overflow: hidden;
		border-radius: 14px;
		background:
			linear-gradient(45deg, rgba(255, 255, 255, 0.05) 25%, transparent 25% 75%, rgba(255, 255, 255, 0.05) 75%),
			#0b1720;
		background-size: 18px 18px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.22),
			0 10px 28px rgba(0, 0, 0, 0.18);
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.crop-preview.avatar-mode {
		width: min(340px, 68vw, 50dvh);
		aspect-ratio: 1;
		border-radius: 50%;
	}

	.crop-preview.dragging {
		cursor: grabbing;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.crop-outline {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.58);
	}

	.drag-hint {
		text-align: center;
		color: var(--muted, #62798a);
		font-size: 11px;
	}

	.crop-controls {
		display: grid;
		gap: 9px;
	}

	.crop-controls label {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		font-size: 12px;
		color: var(--text-secondary, var(--text));
	}

	.crop-controls input[type='range'] {
		width: 100%;
		min-width: 0;
		margin: 0;
		accent-color: var(--accent, #4fa7ec);
	}

	.crop-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.crop-button {
		min-height: 38px;
		padding: 0 15px;
		border-radius: 11px;
		border: 1px solid var(--border, rgba(70, 120, 150, 0.24));
		font: inherit;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.crop-button.secondary {
		background: var(--surface-2, rgba(255, 255, 255, 0.45));
		color: var(--text-primary, var(--text));
	}

	.crop-button.primary {
		border-color: rgba(67, 157, 226, 0.55);
		background: linear-gradient(180deg, #63b8f4, #2587d6);
		color: #fff;
		box-shadow: 0 6px 16px rgba(37, 135, 214, 0.22);
	}

	.crop-button:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.crop-error {
		margin: 0;
		padding: 8px 10px;
		border-radius: 9px;
		background: rgba(196, 58, 70, 0.1);
		color: #c43a46;
		font-size: 12px;
	}

	:global(html[data-theme='dark']) .crop-modal {
		color: #eef8ff;
		background:
			radial-gradient(circle at 18% -12%, rgba(92, 188, 242, 0.08), transparent 38%),
			#102735;
		border-color: rgba(174, 221, 249, 0.14);
		box-shadow: 0 26px 90px rgba(0, 0, 0, 0.52);
	}

	:global(html[data-theme='dark']) .crop-header p,
	:global(html[data-theme='dark']) .drag-hint {
		color: #9fb8c8;
	}

	:global(html[data-theme='dark']) .crop-close,
	:global(html[data-theme='dark']) .crop-button.secondary {
		border-color: rgba(174, 221, 249, 0.14);
		background: rgba(28, 58, 76, 0.88);
		color: #eef8ff;
	}

	:global(html[data-theme='dark']) .crop-controls label {
		color: #d9e9f3;
	}

	@media (max-width: 600px) {
		.crop-backdrop {
			padding: 8px;
		}

		.crop-modal {
			width: calc(100vw - 16px);
			max-height: calc(100dvh - 16px);
			padding: 14px;
			gap: 12px;
			border-radius: 16px;
		}

		.crop-preview.avatar-mode {
			width: min(74vw, 44dvh, 300px);
		}

		.crop-controls label {
			grid-template-columns: 52px minmax(0, 1fr);
			gap: 8px;
		}

		.crop-actions {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}

		.crop-button {
			width: 100%;
			padding-inline: 10px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.crop-button,
		.crop-close {
			transition: none;
		}
	}
</style>
