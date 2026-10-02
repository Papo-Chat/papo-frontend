import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test('keeps sticky bottom when an attachment changes height after render', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 720 });
	await page.goto(`${BASE}/channels/geral`, { waitUntil: 'networkidle' });

	const chat = page.locator('.chat');
	await expect(chat).toBeVisible();

	await page.evaluate(() => {
		const list = document.querySelector<HTMLElement>('.chat');
		const content = document.querySelector<HTMLElement>('.chat-content');
		const bottom = document.querySelector<HTMLElement>('.chat-bottom-anchor');
		if (!list || !content || !bottom) throw new Error('chat not mounted');

		// Make the channel tall enough that changing attachment height creates
		// a meaningful scroll delta.
		const filler = document.createElement('div');
		filler.style.height = '1200px';
		filler.dataset.testFiller = 'true';
		content.insertBefore(filler, bottom);

		list.scrollTop = list.scrollHeight;
	});

	await page.waitForTimeout(50);

	const before = await page.evaluate(() => {
		const list = document.querySelector<HTMLElement>('.chat')!;
		return {
			distance: list.scrollHeight - list.scrollTop - list.clientHeight,
			scrollHeight: list.scrollHeight
		};
	});
	expect(before.distance).toBeLessThanOrEqual(24);

	await page.evaluate(() => {
		const content = document.querySelector<HTMLElement>('.chat-content')!;
		const bottom = document.querySelector<HTMLElement>('.chat-bottom-anchor')!;

		const attachment = document.createElement('div');
		attachment.className = 'attachment-image';
		attachment.dataset.testAttachment = 'true';
		attachment.style.height = '1px';
		content.insertBefore(attachment, bottom);

		requestAnimationFrame(() => {
			attachment.style.height = '360px';
		});
	});

	await page.waitForTimeout(150);

	const after = await page.evaluate(() => {
		const list = document.querySelector<HTMLElement>('.chat')!;
		return {
			distance: list.scrollHeight - list.scrollTop - list.clientHeight,
			scrollHeight: list.scrollHeight
		};
	});

	expect(after.scrollHeight).toBeGreaterThan(before.scrollHeight);
	expect(after.distance).toBeLessThanOrEqual(24);
});
