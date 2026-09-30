import { api } from '$lib/api';

export type HealthStatus = 'checking' | 'online' | 'offline';

export const state = $state({
	status: 'checking' as HealthStatus,
	lastCheckedAt: 0
});

let generation = 0;

export function isOnline(): boolean {
	return state.status === 'online';
}

export async function check(): Promise<boolean> {
	const gen = ++generation;
	state.status = state.lastCheckedAt === 0 ? 'checking' : state.status;

	try {
		const response = await api.health.ping();
		if (gen !== generation) return state.status === 'online';

		const online = response.trim().toUpperCase() === 'OK';
		state.status = online ? 'online' : 'offline';
		state.lastCheckedAt = Date.now();
		return online;
	} catch {
		if (gen !== generation) return state.status === 'online';

		state.status = 'offline';
		state.lastCheckedAt = Date.now();
		return false;
	}
}

export function startPolling(intervalMs = 10000): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setInterval> | null = null;

	const run = async () => {
		if (stopped) return;
		await check();
	};

	void run();
	timer = setInterval(() => {
		void run();
	}, intervalMs);

	const onVisibilityChange = () => {
		if (!document.hidden) void run();
	};
	document.addEventListener('visibilitychange', onVisibilityChange);

	return () => {
		stopped = true;
		if (timer) clearInterval(timer);
		timer = null;
		document.removeEventListener('visibilitychange', onVisibilityChange);
	};
}
