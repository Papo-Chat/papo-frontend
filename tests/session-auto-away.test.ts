import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	updateStatus: vi.fn(),
	whoami: vi.fn()
}));

vi.mock('../src/lib/api', () => ({
	api: {
		auth: {
			whoami: mocks.whoami,
			refresh: vi.fn(),
			logout: vi.fn()
		},
		users: {
			updateStatus: mocks.updateStatus
		}
	},
	setOnUnauthorized: vi.fn()
}));

vi.mock('../src/lib/store/users.svelte', () => ({
	seedMe: vi.fn(),
	loadList: vi.fn(),
	reset: vi.fn(),
	setPersistedStatus: vi.fn()
}));
vi.mock('../src/lib/store/roles.svelte', () => ({
	load: vi.fn(),
	reset: vi.fn()
}));
vi.mock('../src/lib/store/settings.svelte', () => ({
	seed: vi.fn(),
	reset: vi.fn()
}));
vi.mock('../src/lib/store/channels.svelte', () => ({ reset: vi.fn() }));
vi.mock('../src/lib/store/messages.svelte', () => ({ reset: vi.fn() }));
vi.mock('../src/lib/store/dms.svelte', () => ({ load: vi.fn(), reset: vi.fn() }));
vi.mock('../src/lib/store/blocks.svelte', () => ({ load: vi.fn(), reset: vi.fn() }));
vi.mock('../src/lib/store/notifications.svelte', () => ({ load: vi.fn(), reset: vi.fn() }));
vi.mock('../src/lib/store/emojis.svelte', () => ({ loadAll: vi.fn(), reset: vi.fn() }));
vi.mock('../src/lib/store/server.svelte', () => ({ reset: vi.fn() }));
vi.mock('../src/lib/store/websocket.svelte', () => ({
	connect: vi.fn(),
	disconnect: vi.fn()
}));
vi.mock('../src/lib/store/voice.svelte', () => ({}));
vi.mock('../src/lib/utils/notification-sound', () => ({
	prepareNotificationSound: vi.fn()
}));
vi.mock('../src/lib/utils/session-epoch', () => ({
	bumpSessionEpoch: vi.fn(),
	currentSessionEpoch: vi.fn(() => 1),
	isCurrentSessionEpoch: vi.fn(() => true)
}));

class WindowStub extends EventTarget {
	location = { origin: 'http://localhost' };
}

class DocumentStub extends EventTarget {
	hidden = false;
}

const me = {
	id: 'me',
	username: 'me',
	nickname: null,
	avatar_blob: null,
	avatar_format: '',
	status: null,
	status_message: null,
	typing: null,
	status_updated_at: null,
	created_at: '2026-01-01T00:00:00Z',
	roles: [],
	settings: { version: 1, config: {} },
	connection_violation: false
};

describe('automatic away status', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('window', new WindowStub());
		vi.stubGlobal('document', new DocumentStub());
		mocks.whoami.mockResolvedValue(me);
		mocks.updateStatus.mockReset();
		mocks.updateStatus.mockResolvedValue({ response: 'ok' });
	});

	afterEach(async () => {
		const session = await import('../src/lib/store/session.svelte');
		session.clearLocalSession();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('returns to online on activity after automatic away', async () => {
		const session = await import('../src/lib/store/session.svelte');
		await session.load();

		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
		expect(mocks.updateStatus).toHaveBeenCalledWith('me', { status: 'away' });
		expect(session.state.status).toBe('away');

		window.dispatchEvent(new Event('pointermove'));
		await vi.runAllTicks();

		expect(mocks.updateStatus).toHaveBeenLastCalledWith('me', { status: null });
		expect(session.state.status).toBeNull();
	});

	it('does not lose activity while the away request is still completing', async () => {
		let resolveAway!: (value: { response: string }) => void;
		const awayPending = new Promise<{ response: string }>((resolve) => {
			resolveAway = resolve;
		});
		mocks.updateStatus.mockImplementationOnce(() => awayPending);

		const session = await import('../src/lib/store/session.svelte');
		await session.load();

		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
		window.dispatchEvent(new Event('mousemove'));

		resolveAway({ response: 'ok' });
		await vi.runAllTicks();
		await Promise.resolve();
		await vi.runAllTicks();

		expect(mocks.updateStatus).toHaveBeenNthCalledWith(1, 'me', { status: 'away' });
		expect(mocks.updateStatus).toHaveBeenNthCalledWith(2, 'me', { status: null });
		expect(session.state.status).toBeNull();
	});
});
