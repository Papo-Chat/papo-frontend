import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test('mobile topbar keeps channel title visible and closes channel drawer after selection', async ({ page }) => {
	await page.setViewportSize({ width: 380, height: 844 });
	await page.goto(`${BASE}/channels/geral`, { waitUntil: 'networkidle' });

	const title = page.locator('.topbar .title-row h2');
	await expect(title).toBeVisible();
	await expect(title).not.toHaveCSS('width', '0px');

	await page.getByRole('button', { name: 'Abrir canais' }).click();

	const sidebar = page.locator('.sidebar');
	await expect(sidebar).toHaveClass(/open/);

	const target = sidebar.locator('button.nav-item').filter({ hasText: 'design' }).first();
	await expect(target).toBeVisible();
	await target.click();

	await expect(sidebar).not.toHaveClass(/open/);
	await expect(page).toHaveURL(/\/channels\/design$/);
	await expect(page.locator('.topbar .title-row h2')).toBeVisible();
});
