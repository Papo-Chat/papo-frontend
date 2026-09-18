// User settings store. Seeded from whoami.settings; updated via
// PUT /users/settings.

import { api } from '../api';
import type { UserConfig, UserSettings } from '../types';

export const state = $state({
	config: null as UserConfig | null,
	version: 0,
	loaded: false,
});

export function seed(config: UserConfig, version: number): void {
	state.config = config;
	state.version = version;
	state.loaded = true;
}

export async function load(): Promise<void> {
	const res = await api.auth.whoami();
	seed(res.settings.config, res.settings.version);
}

export async function update(config: UserConfig): Promise<UserSettings> {
	const settings = await api.users.updateSettings(config);
	state.config = settings.config;
	state.version = settings.version;
	return settings;
}

// ── derived accessors ──────────────────────────────────

export function theme(): string {
	return state.config?.theme ?? 'system';
}

export function soundEnabled(): boolean {
	return state.config?.notifications.sound ?? false;
}

export function messagePreviewEnabled(): boolean {
	return state.config?.notifications.messagePreview ?? false;
}

export function mentionsEnabled(): boolean {
	return state.config?.notifications.mentions ?? false;
}

export function notificationsEnabled(): boolean {
	return state.config?.notifications.enabled ?? false;
}
