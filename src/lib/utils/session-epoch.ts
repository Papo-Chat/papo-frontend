// session-epoch.ts
let epoch = 0;

export function currentSessionEpoch(): number {
	return epoch;
}

export function bumpSessionEpoch(): void {
	epoch += 1;
}

export function isCurrentSessionEpoch(value: number): boolean {
	return value === epoch;
}
