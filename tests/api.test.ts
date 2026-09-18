// Vitest on core logic: REST transport (api.ts §5).
//
// Covers: ApiError parsing (RFC 7807), X-Request-ID generation, 204 →
// undefined, 401 → onUnauthorized hook, and query serialization.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	health,
	server,
	users,
	auth,
	ApiError,
	setOnUnauthorized,
	clearOnUnauthorized,
} from '../src/lib/api';

// Provide a minimal window so buildUrl() resolves same-origin URLs in node.
// Stubbed per-test (afterEach un-stubs it via unstubAllGlobals).
const windowStub = {
	location: { origin: 'http://localhost:3000' },
} as unknown as Window;

beforeEach(() => {
	vi.stubGlobal('window', windowStub);
});

interface FetchCall {
	url: string;
	init: RequestInit;
}

type FetchOpts = {
	status: number;
	body?: unknown;
	text?: string;
	contentType?: string;
};

function installFetch(opts: FetchOpts): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	const mock = vi.fn(async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		// Node's Response constructor rejects status 204; the request()
		// path only reads res.status for 204, so a minimal object suffices.
		if (opts.status === 204) {
			return { status: 204 } as unknown as Response;
		}
		const body =
			opts.text ??
			(opts.body === undefined ? '' : JSON.stringify(opts.body));
		return new Response(body, {
			status: opts.status,
			headers: { 'content-type': opts.contentType ?? 'application/json' },
		});
	});
	vi.stubGlobal('fetch', mock);
	return { calls };
}

// Await a promise that rejects, capture the thrown error, and run assertions.
async function expectApiError(
	who: () => Promise<unknown>,
	check: (err: ApiError) => void
): Promise<void> {
	let err: unknown;
	try {
		await who();
		expect(false, 'expected promise to reject').toBe(true);
	} catch (e) {
		err = e;
	}
	const error = err as ApiError;
	expect(error).toBeInstanceOf(ApiError);
	check(error);
}

// RFC 7807 problem body helper.
function problem(status: number, detail: string): {
	type: string;
	title: string;
	status: number;
	detail: string;
	instance: string | null;
} {
	return {
		type: 'https://www.ietf.org/rfc/rfc7807#section-15.1',
		title: 'Problem',
		status,
		detail,
		instance: null,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	clearOnUnauthorized();
});

describe('200 / raw responses', () => {
	it('returns text for raw endpoints (health.ping)', async () => {
		installFetch({ status: 200, text: 'OK', contentType: 'text/plain' });
		const res = await health.ping();
		expect(res).toBe('OK');
	});

	it('returns parsed JSON for standard endpoints (server.get)', async () => {
		installFetch({
			status: 200,
			body: {
				id: 's1',
				name: 'Test',
				icon_blob: null,
				icon_format: 'png',
				owner_id: null,
				owner_username: null,
				public: false,
				created_at: '2024-01-01T00:00:00Z',
				role_count: 0,
				member_count: 0,
				channel_count: 0,
			},
		});
		const res = await server.get();
		expect(res).not.toBeNull();
		expect(res?.id).toBe('s1');
	});
});

describe('404 handling', () => {
	it('server.get() maps 404 → null (F7)', async () => {
		installFetch({ status: 404, body: problem(404, 'Server not created') });
		const res = await server.get();
		expect(res).toBeNull();
	});

	it('other endpoints throw ApiError on 404', async () => {
		installFetch({ status: 404, body: problem(404, 'Resource not found') });
		await expect(auth.whoami()).rejects.toThrow(ApiError);
	});
});

describe('ApiError (RFC 7807) parsing', () => {
	it('parses all RFC 7807 fields from the body', async () => {
		const body = problem(404, 'Resource does not exist');
		body.instance = 'http://localhost/missing';
		installFetch({ status: 404, body });
		await expectApiError(
			() => auth.whoami(),
			(err) => {
				expect(err.name).toBe('ApiError');
				expect(err.type).toBe(body.type);
				expect(err.title).toBe(body.title);
				expect(err.status).toBe(404);
				expect(err.detail).toBe(body.detail);
				expect(err.instance).toBe(body.instance);
			}
		);
	});

	it('falls back to defaults when the body lacks RFC 7807 fields', async () => {
		installFetch({ status: 500, body: {} });
		await expectApiError(
			() => auth.whoami(),
			(err) => {
				expect(err.name).toBe('ApiError');
				// status comes from the body field, absent → 0.
				expect(err.status).toBe(0);
				expect(err.type).toBe('about:blank');
				expect(err.title).toBe('Error');
			}
		);
	});
});

describe('X-Request-ID', () => {
	it('sends an X-Request-ID header and echoes it in the thrown error', async () => {
		const { calls } = installFetch({
			status: 404,
			body: problem(404, 'Not found'),
		});
		let sent: string | null = null;
		await expectApiError(
			() => auth.whoami(),
			(err) => {
				sent = err.requestId;
			}
		);
		const call = calls[0];
		const headerId =
			(call.init.headers as Record<string, string>)['X-Request-ID'];
		expect(headerId).toBeDefined();
		// The same id is propagated into the ApiError.
		expect(headerId).toBe(sent);
	});
});

describe('204 handling', () => {
	it('returns undefined on 204 (auth.logout)', async () => {
		installFetch({ status: 204, text: '' });
		const res = await auth.logout();
		expect(res).toBeUndefined();
	});
});

describe('401 onUnauthorized hook', () => {
	it('invokes the registered hook on 401', async () => {
		const hook = vi.fn();
		setOnUnauthorized(hook);
		installFetch({ status: 401, body: problem(401, 'Not authenticated') });
		await expect(auth.whoami()).rejects.toThrow(ApiError);
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('does not throw a hook error when none is registered', async () => {
		clearOnUnauthorized();
		installFetch({ status: 401, body: problem(401, 'Not authenticated') });
		await expect(auth.whoami()).rejects.toThrow(ApiError);
	});
});

describe('query serialization', () => {
	it('serializes since + last_id into the request URL', async () => {
		const { calls } = installFetch({
			status: 200,
			body: { users: [], has_more: false },
		});
		await users.list({ since: '2024-01-01T00:00:00Z', last_id: 'abc' });
		const url = new URL(calls[0].url);
		expect(url.href).toBe('http://localhost:3000/users?since=2024-01-01T00%3A00%3A00Z&last_id=abc');
		expect(url.searchParams.get('since')).toBe('2024-01-01T00:00:00Z');
		expect(url.searchParams.get('last_id')).toBe('abc');
	});

	it('omits undefined query values', async () => {
		const { calls } = installFetch({
			status: 200,
			body: { users: [], has_more: false },
		});
		await users.list({ since: undefined, last_id: undefined });
		const url = new URL(calls[0].url);
		expect(url.search).toBe('');
	});
});
