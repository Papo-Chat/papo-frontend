// Throttle and debounce utilities.

type Throttleable = (...args: unknown[]) => void;

// `throttle` limits the execution of `fn` to at most once per `ms` (leading
// edge). Used for typing indicators so we don't spam the server.
export function throttle<Args extends unknown[]>(
	fn: (...args: Args) => void,
	ms: number
): (...args: Args) => void {
	let last = 0;
	return function throttled(this: unknown, ...args: Args) {
		const now = Date.now();
		if (now - last >= ms) {
			last = now;
			fn.apply(this, args);
		}
	};
}

type Debounceable = (...args: unknown[]) => void;

// `debounce` delays the execution of `fn` until `ms` has passed since the
// last invocation (trailing edge). Used for debouncing refetches (e.g.
// channel reseeding after channel_create).
export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	ms: number
): { run: (...args: Args) => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return {
		run(...args: Args) {
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(() => {
				timer = null;
				fn(...args);
			}, ms);
		},
		cancel() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		},
	};
}
