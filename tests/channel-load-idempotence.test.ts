import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import * as messages from '../src/lib/store/messages.svelte';
import * as channels from '../src/lib/store/channels.svelte';
import * as dms from '../src/lib/store/dms.svelte';
import type { Channel, DirectConversation } from '../src/lib/types';

const channel = {
 id: 'channel-1', name: 'general', type: 'text', position: 0,
 permissions: [], created_at: '2026-10-10T00:00:00Z', topic: null,
 last_message: null, last_read_message: 'm1',
 last_read_at: '2026-10-10T00:00:00Z', notification_settings: 'all'
} as unknown as Channel;

beforeEach(() => {
 messages.reset();
 channels.reset();
 dms.reset();
});

afterEach(() => {
 vi.restoreAllMocks();
 messages.reset();
 channels.reset();
 dms.reset();
});

describe('re-entering a mobile channel', () => {
 it('reuses already-loaded history, including while older pagination is loading', async () => {
  const list = vi.spyOn(api.messages, 'list').mockResolvedValue({
   messages: [], has_more: false
  });
  await messages.ensureLoaded('channel-1');
  expect(list).toHaveBeenCalledTimes(1);
  await messages.ensureLoaded('channel-1');
  expect(list).toHaveBeenCalledTimes(1);

  const current = messages.getChannel('channel-1')!;
  messages.state.channels.set('channel-1', { ...current, loading: true, windowMode: 'historical' });
  await messages.ensureLoaded('channel-1');
  expect(list).toHaveBeenCalledTimes(1);
  expect(messages.getChannel('channel-1')?.windowMode).toBe('historical');
 });

 it('deduplicates simultaneous first loads', async () => {
  const list = vi.spyOn(api.messages, 'list').mockResolvedValue({
   messages: [], has_more: false
  });
  await Promise.all([
   messages.ensureLoaded('channel-1'),
   messages.ensureLoaded('channel-1'),
   messages.ensureLoaded('channel-1')
  ]);
  expect(list).toHaveBeenCalledTimes(1);
 });

 it('does not rewrite an unchanged channel read checkpoint', () => {
  channels.state.byId.set(channel.id, channel);
  channels.state.unread.set(channel.id, {has: false, count: 0});
  const before = channels.state.byId.get(channel.id);
  const unread = channels.state.unread.get(channel.id);
  channels.markReadLocal(channel.id, 'm1', '2026-10-10T00:00:00Z');
  expect(channels.state.byId.get(channel.id)).toBe(before);
  expect(channels.state.unread.get(channel.id)).toBe(unread);
  channels.state.unread.set(channel.id, {has: true, count: 1});
  channels.markReadLocal(channel.id, 'm1', '2026-10-10T00:00:00Z');
  expect(channels.state.unread.get(channel.id)).toEqual({has: false, count: 0});
 });

 it('does not rewrite an unchanged direct-message read checkpoint', () => {
  const dm = {
   id: 'dm1', last_read_message: 'm1',
   last_read_at: '2026-10-10T00:00:00Z', unread_count: 0
  } as DirectConversation;
  dms.state.byId.set(dm.id, dm);
  dms.markReadLocal(dm.id, 'm1', '2026-10-10T00:00:00Z');
  expect(dms.state.byId.get(dm.id)).toBe(dm);
 });
});
