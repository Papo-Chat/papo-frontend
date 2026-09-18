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

export function send(msg: WsInbound): void {
	if (instance?.readyState === WebSocket.OPEN) {
		instance.send(JSON.stringify(msg));
	}
}
