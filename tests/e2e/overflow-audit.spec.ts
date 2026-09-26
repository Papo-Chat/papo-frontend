import { test, expect } from '@playwright/test';

// All routes to audit at the iPhone-13-width (380px) viewport.
const routes = [
	'/auth',
	'/auth/register',
	'/channels/geral',
	'/channels/design',
	'/channels/feedback',
	'/channels/ideias',
	'/channels/projetos',
	'/channels/eventos',
	'/channels/lounge',
	'/channels/reuniao',
	'/channels/musica',
	'/channels/mensagens',
	'/channels/favoritos',
	'/channels/geral/admin',
	'/users/luna',
	'/user/settings',
	'/user/settings/profile',
	'/admin/roles',
	'/admin/roles/role-owner',
	'/admin/channels',
	'/admin/users',
	'/admin/audit',
	'/admin/emojis',
	'/admin/server',
];

// The dev server (inside the container) binds to IPv6 ::1:5173, so the
// browser must reach it via localhost (→ ::1), not 127.0.0.1.
const BASE = 'http://localhost:5173';

type Overflow = {
	tag: string;
	id: string;
	cls: string;
	clientWidth: number;
	scrollWidth: number;
	overflowX: string;
	position: string;
};

const overflowScript: string = `(() => {
	const over = [];
	function walk(el) {
		if (el.scrollWidth > el.clientWidth + 1) {
			over.push({
				tag: el.tagName,
				id: el.id,
				cls: (el.className || '').split(' ').slice(0, 4).join(' '),
				clientWidth: el.clientWidth,
				scrollWidth: el.scrollWidth,
				overflowX: getComputedStyle(el).overflowX,
				position: getComputedStyle(el).position
			});
		}
		for (const c of el.children) walk(c);
	}
	walk(document.documentElement);
	return over;
})()`;

// One test per route so failures are isolated and named by URL.
for (const route of routes) {
	test(`audit ${route}`, async ({ page }) => {
		await page.setViewportSize({ width: 380, height: 844 });
		const response = await page.goto(`${BASE}${route}`, {
			waitUntil: 'networkidle',
			timeout: 60000
		});
		// SPA (ssr:false) always serves index.html → 200. Catch 4xx/5xx.
		expect(response?.status()).toBe(200);
		await page.waitForTimeout(250);

		// The app renders client-side; verify real content mounted (not a 404 shell).
		const bodyLen = await page.evaluate(() =>
			document.body?.innerHTML?.length ?? 0
		);
		expect(bodyLen).toBeGreaterThan(100);

		const overflows: Overflow[] = await page.evaluate(overflowScript);

		console.log(`\n${overflows.length ? 'OVERFLOW' : 'PASS'} ${route} (${overflows.length} elements)`);
		for (const o of overflows) {
			console.log(
				`  ${o.tag}${o.id ? '#' + o.id : ''} .${o.cls}  cw=${o.clientWidth} sw=${o.scrollWidth}  ox=${o.overflowX} pos=${o.position}`
			);
		}

		// Vertical-scroll regression (Chromium): `justify-content: flex-end`
		// on the scroll container collapsed .chat scrollHeight to clientHeight
		// (no scrollbar, top unreachable). With "safe flex-end" overflowing chat
		// content must stay scrollable and both ends reachable.
		const chatScroll = await page.evaluate(() => {
			const chat = document.querySelector<HTMLElement>('.chat');
			if (!chat) return null;
			chat.style.scrollBehavior = 'auto';
			const range = chat.scrollHeight - chat.clientHeight;
			chat.scrollTop = Math.max(0, range);
			const atBottom = chat.scrollTop;
			chat.scrollTo({ top: 0 });
			const stuckTop = chat.scrollTop;
			return { range, atBottom, stuckTop };
		});
		if (chatScroll) {
			if (route === '/channels/geral') {
				// long channel: scrollHeight must NOT collapse (scrollbar present).
				expect(chatScroll.range).toBeGreaterThan(0);
			}
			if (chatScroll.range > 0) {
				// content overflows → bottom reachable and top reachable.
				expect(chatScroll.atBottom).toBe(chatScroll.range);
				expect(chatScroll.stuckTop).toBe(0);
			}
			// restore the natural auto-scroll (bottom) state before the screenshot.
			await page.evaluate(() => {
				const chat = document.querySelector<HTMLElement>('.chat');
				if (chat) {
					chat.style.scrollBehavior = '';
					chat.scrollTop = chat.scrollHeight;
				}
			});
		}

		const slug = route
			.replace(/^[^\/]+/g, '')
			.replace(/[^a-z0-9]+/gi, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/, '');
		await page.screenshot({
			path: `test-results/overflow-${slug}.png`,
			fullPage: false
		});

	});
}
