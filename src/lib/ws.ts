// Plain WebSocket instance holder + send. No Svelte reactivity — kept
// separate from the reactive websocket store so other stores (e.g. voice)
// can call send() without importing the store (avoids a store cycle).

import type { WsInbound } from './types';

let instance: WebSocket | null = null;

export function setInstance(ws: WebSocket | null): void {
	instance = ws;
}

export function getInstance(): WebSocket | null {
	return instance;
}

// Returns false when the socket is not OPEN so callers (voice signalling)
// can abort the operation instead of silently dropping it.
export function send(msg: WsInbound): boolean {
	if (instance?.readyState !== WebSocket.OPEN) {
		return false;
	}
	instance.send(JSON.stringify(msg));
	return true;
}
