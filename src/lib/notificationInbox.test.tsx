import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import {
  fetchInbox,
  inboxQueryKey,
  itemExists,
  markRead,
  useHasUnread,
  type InboxItem,
} from './notificationInbox';
import { getDevicePushToken } from './push';
import { readReminderLog } from './reminderLog';
import { getSupabase } from './supabase';

jest.mock('./supabase');
jest.mock('./push', () => ({ getDevicePushToken: jest.fn() }));
jest.mock('./reminderLog', () => ({ readReminderLog: jest.fn() }));
let mockSession: { status: string; userId?: string } = { status: 'signedOut' };
jest.mock('./authSession', () => ({ useAuthSession: () => mockSession }));

const NOW = new Date('2026-11-15T15:00:00Z');
const rpc = jest.fn();
const getSession = jest.fn();
let eventRow: { id: string } | null = { id: 'e1' };

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    kind: 'event',
    item_id: 'e1',
    unit_id: 'icara',
    title: 'Batismo',
    body: '',
    event_starts_at: '2026-11-21T18:00:00Z',
    event_location: 'Capela',
    created_at: '2026-11-15T13:00:00Z',
    read: false,
    ...overrides,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockSession = { status: 'signedOut' };
  eventRow = { id: 'e1' };
  (getDevicePushToken as jest.Mock).mockResolvedValue('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
  (readReminderLog as jest.Mock).mockResolvedValue([]);
  rpc.mockResolvedValue({ data: [notification()], error: null });
  getSession.mockResolvedValue({ data: { session: null } });
  (getSupabase as jest.Mock).mockReturnValue({
    rpc,
    auth: { getSession },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: eventRow, error: null }) }),
      }),
    }),
  });
});

describe('inboxQueryKey', () => {
  it('never starts with public (personal data stays out of the persisted cache)', () => {
    expect(inboxQueryKey(null)[0]).not.toBe('public');
    expect(inboxQueryKey('u1')).toEqual(['inbox', 'u1']);
    expect(inboxQueryKey(null)).toEqual(['inbox', 'visitor']);
  });
});

describe('fetchInbox', () => {
  it('builds the event body in the app language', async () => {
    const items = await fetchInbox(null, NOW);
    expect(items).toEqual([
      expect.objectContaining({
        id: 'n1',
        kind: 'event',
        itemId: 'e1',
        unitId: 'icara',
        title: 'Batismo',
        body: 'Sábado, 21 de novembro · 15:00 · Capela',
        read: false,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith('my_notifications', {
      p_device_token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
    });
  });

  it('a post keeps the stored first line as body', async () => {
    rpc.mockResolvedValue({
      data: [notification({ kind: 'post', body: 'Primeira linha', event_starts_at: null })],
      error: null,
    });
    expect((await fetchInbox(null, NOW))[0].body).toBe('Primeira linha');
  });

  it('CA-19: a reminder that already fired becomes a reminder item and a future one does not', async () => {
    (readReminderLog as jest.Mock).mockResolvedValue([
      { noteId: 'past', title: 'Ligar para o bispo', fireAt: '2026-11-14T12:00:00.000Z' },
      { noteId: 'future', title: 'Amanhã', fireAt: '2026-11-16T12:00:00.000Z' },
    ]);
    const items = await fetchInbox(null, NOW);
    const reminder = items.find((item) => item.kind === 'reminder');
    expect(reminder).toEqual(
      expect.objectContaining({
        id: 'reminder:past:2026-11-14T12:00:00.000Z',
        itemId: 'past',
        title: 'Ligar para o bispo',
        unitId: null,
      }),
    );
    expect(items.some((item) => item.itemId === 'future')).toBe(false);
    expect(items.map((item) => item.at.getTime())).toEqual(
      [...items.map((item) => item.at.getTime())].sort((a, b) => b - a),
    );
  });

  it('without a token and without an account it does not call the server', async () => {
    (getDevicePushToken as jest.Mock).mockResolvedValue(null);
    expect(await fetchInbox(null, NOW)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    await fetchInbox('u1', NOW);
    expect(rpc).toHaveBeenCalledWith('my_notifications', {});
  });

  it('a signed-in person gets the server read state; a visitor gets the local one', async () => {
    rpc.mockResolvedValue({ data: [notification({ read: true })], error: null });
    expect((await fetchInbox('u1', NOW))[0].read).toBe(true);
    expect((await fetchInbox(null, NOW))[0].read).toBe(false);
    await AsyncStorage.setItem('notifications.read.v1', JSON.stringify(['n1']));
    rpc.mockResolvedValue({ data: [notification({ read: false })], error: null });
    expect((await fetchInbox(null, NOW))[0].read).toBe(true);
  });

  it('prunes local read ids that are no longer in the history', async () => {
    await AsyncStorage.setItem('notifications.read.v1', JSON.stringify(['n1', 'gone']));
    await fetchInbox(null, NOW);
    expect(JSON.parse((await AsyncStorage.getItem('notifications.read.v1')) ?? '[]')).toEqual([
      'n1',
    ]);
  });

  it('throws when the server fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('down') });
    await expect(fetchInbox(null, NOW)).rejects.toThrow('down');
  });
});

describe('markRead', () => {
  const item = (overrides: Partial<InboxItem> = {}): InboxItem => ({
    id: 'n1',
    kind: 'event',
    itemId: 'e1',
    unitId: 'icara',
    title: 'Batismo',
    body: '',
    at: new Date('2026-11-15T13:00:00Z'),
    read: false,
    ...overrides,
  });
  const reminder = item({
    id: 'reminder:r1:2026-11-14T12:00:00.000Z',
    kind: 'reminder',
    itemId: 'r1',
  });

  function clientWith(items: InboxItem[]) {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    client.setQueryData(inboxQueryKey('u1'), items);
    return client;
  }

  it('CA-16: signed in, marking all calls the RPC without ids, stores reminders locally and clears the unread state', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    rpc.mockResolvedValue({ data: null, error: null });
    const items = [item(), reminder];
    const client = clientWith(items);
    await markRead(null, items, client);
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', {});
    expect(JSON.parse((await AsyncStorage.getItem('notifications.read.v1')) ?? '[]')).toEqual([
      reminder.id,
    ]);
    const cached = client.getQueryData<InboxItem[]>(inboxQueryKey('u1'));
    expect(cached?.every((i) => i.read)).toBe(true);
  });

  it('signed in, marking one item sends only its id', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    rpc.mockResolvedValue({ data: null, error: null });
    const items = [item(), item({ id: 'n2' })];
    await markRead(['n2'], items, clientWith(items));
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: ['n2'] });
  });

  it('a visitor marks only locally', async () => {
    const items = [item(), reminder];
    await markRead(null, items, clientWith(items));
    expect(rpc).not.toHaveBeenCalled();
    expect(
      JSON.parse((await AsyncStorage.getItem('notifications.read.v1')) ?? '[]').sort(),
    ).toEqual(['n1', reminder.id].sort());
  });

  it('does nothing for items that are already read', async () => {
    const items = [item({ read: true })];
    await markRead(['n1'], items, clientWith(items));
    expect(getSession).not.toHaveBeenCalled();
  });

  it('propagates a server failure and keeps the cache unchanged', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    rpc.mockResolvedValue({ data: null, error: new Error('down') });
    const items = [item()];
    const client = clientWith(items);
    await expect(markRead(['n1'], items, client)).rejects.toThrow('down');
    expect(client.getQueryData<InboxItem[]>(inboxQueryKey('u1'))?.[0].read).toBe(false);
  });
});

describe('useHasUnread', () => {
  function wrapper() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client }, children);
    }
    return Wrapper;
  }

  it('is true with an unread item and false once everything is read locally', async () => {
    const { result } = await renderHook(() => useHasUnread(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));

    await AsyncStorage.setItem('notifications.read.v1', JSON.stringify(['n1']));
    const second = await renderHook(() => useHasUnread(), { wrapper: wrapper() });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current).toBe(false));
  });
});

describe('itemExists', () => {
  it('an event that is gone no longer exists', async () => {
    expect(await itemExists('event', 'e1')).toBe(true);
    eventRow = null;
    expect(await itemExists('event', 'e1')).toBe(false);
  });

  it('posts and reminders are assumed to exist until their specs arrive', async () => {
    expect(await itemExists('post', 'p1')).toBe(true);
    expect(await itemExists('reminder', 'r1')).toBe(true);
  });
});
