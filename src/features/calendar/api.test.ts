import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { getSupabase } from '@/lib/supabase';

import { track } from '@/lib/telemetry';

import {
  EventWriteError,
  createEvent,
  deleteEvent,
  eventQueryKey,
  eventsMonthQueryKey,
  fetchEvent,
  fetchEventsInMonth,
  toCalendarEvent,
  updateEvent,
  useEvent,
  useEventCache,
  type StoredEvent,
  useEventsAround,
} from './api';

jest.mock('@/lib/supabase');
jest.mock('@/lib/telemetry', () => ({ track: jest.fn() }));

type Result = { data: unknown; error: unknown };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    unit_id: 'icara',
    type: 'meeting',
    title: 'Conselho',
    starts_at: '2026-11-13T22:00:00+00:00',
    ends_at: '2026-11-14T00:00:00+00:00',
    location: 'Capela',
    notes: '',
    links: ['https://example.org'],
    ...overrides,
  };
}

const storedCached = {
  id: 'c1',
  unitId: 'estaca',
  type: 'activity',
  title: 'Em cache',
  startsAt: '2026-11-13T22:00:00.000Z',
  endsAt: '2026-11-14T00:00:00.000Z',
  location: '',
  notes: '',
  links: [],
};

/** A thenable query builder that records the calls made on it. */
function mockEvents(result: Result) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'lt', 'gt', 'order', 'eq']) {
    chain[name] = (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: (value: Result) => unknown) => resolve(result);
  const from = jest.fn(() => chain);
  (getSupabase as jest.Mock).mockReturnValue({ from });
  return { calls, from };
}

// The queries here keep a 7-day gcTime: clear them so no timer keeps Jest alive.
const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

function newClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('query keys', () => {
  it('start with "public" so they are persisted (RNF-01)', () => {
    expect(eventsMonthQueryKey('2026-11')).toEqual(['public', 'events', 'month', '2026-11']);
    expect(eventQueryKey('x')).toEqual(['public', 'event', 'x']);
  });
});

describe('fetchEventsInMonth', () => {
  it('filters by overlap with the month in Sao Paulo (RNF-03)', async () => {
    const { calls, from } = mockEvents({ data: [row()], error: null });
    await fetchEventsInMonth('2026-11');
    expect(from).toHaveBeenCalledWith('events');
    expect(calls.lt).toEqual([['starts_at', '2026-12-01T03:00:00.000Z']]);
    expect(calls.gt).toEqual([['ends_at', '2026-11-01T03:00:00.000Z']]);
  });

  it('maps rows to JSON-safe events and drops unknown unit or type', async () => {
    mockEvents({
      data: [row(), row({ id: 'e2', unit_id: 'mars' }), row({ id: 'e3', type: 'party' })],
      error: null,
    });
    const events = await fetchEventsInMonth('2026-11');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'e1',
      unitId: 'icara',
      type: 'meeting',
      startsAt: '2026-11-13T22:00:00.000Z',
    });
    expect(toCalendarEvent(events[0]).startsAt).toEqual(new Date('2026-11-13T22:00:00Z'));
  });

  it('throws on a Supabase error', async () => {
    mockEvents({ data: null, error: new Error('network') });
    await expect(fetchEventsInMonth('2026-11')).rejects.toThrow('network');
  });
});

describe('fetchEvent', () => {
  it('CA-17: returns null for an unknown id', async () => {
    mockEvents({ data: null, error: null });
    await expect(fetchEvent('missing')).resolves.toBeNull();
  });

  it('returns null for a row with an unknown unit', async () => {
    mockEvents({ data: row({ unit_id: 'mars' }), error: null });
    await expect(fetchEvent('e1')).resolves.toBeNull();
  });

  it('returns the event', async () => {
    mockEvents({ data: row(), error: null });
    await expect(fetchEvent('e1')).resolves.toMatchObject({ id: 'e1', title: 'Conselho' });
  });

  it('throws on a Supabase error', async () => {
    mockEvents({ data: null, error: new Error('boom') });
    await expect(fetchEvent('e1')).rejects.toThrow('boom');
  });
});

describe('useEventsAround', () => {
  it('reads the visible month and its neighbours, deduplicating by id', async () => {
    const client = newClient();
    const { from } = mockEvents({ data: [row()], error: null });
    const { result } = await renderHook(() => useEventsAround({ year: 2026, month: 11, day: 13 }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    await waitFor(() => expect(from).toHaveBeenCalledTimes(3));
    // The same row comes back for all three months: deduplicated.
    await waitFor(() => expect(client.getQueryData(eventsMonthQueryKey('2026-12'))).toBeDefined());
    expect(result.current.events).toHaveLength(1);
    expect(client.getQueryData(eventsMonthQueryKey('2026-10'))).toBeDefined();
  });

  it('CA-18: reports error when the visible month fails and nothing is cached', async () => {
    mockEvents({ data: null, error: new Error('network') });
    const { result } = await renderHook(() => useEventsAround({ year: 2026, month: 11, day: 13 }), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.events).toEqual([]);
  });

  it('is already a success when the visible month is cached', async () => {
    const client = newClient();
    client.setQueryData(eventsMonthQueryKey('2026-11'), [storedCached]);
    mockEvents({ data: [], error: null });
    const { result } = await renderHook(() => useEventsAround({ year: 2026, month: 11, day: 13 }), {
      wrapper: wrapper(client),
    });
    expect(result.current.status).toBe('success');
    expect(result.current.events.map((e) => e.title)).toEqual(['Em cache']);
  });
});

describe('useEvent', () => {
  it('uses the event found in a cached month as placeholder', async () => {
    const client = newClient();
    client.setQueryData(eventsMonthQueryKey('2026-11'), [storedCached]);
    // The fetch never settles, so the assertion sees the placeholder, not the fetched result.
    const pending = new Promise(() => {});
    const chain: Record<string, unknown> = { select: () => chain, eq: () => chain };
    chain.maybeSingle = () => pending;
    (getSupabase as jest.Mock).mockReturnValue({ from: () => chain });
    const { result } = await renderHook(() => useEvent('c1'), { wrapper: wrapper(client) });
    expect(result.current.data?.title).toBe('Em cache');
    expect(result.current.data?.startsAt).toBeInstanceOf(Date);
  });
});

const input = {
  unitId: 'icara' as const,
  type: 'meeting' as const,
  title: 'Conselho',
  startsAt: new Date('2026-11-13T22:30:00Z'),
  endsAt: new Date('2026-11-14T00:30:00Z'),
  location: 'Capela',
  notes: '',
  links: ['https://example.org'],
};

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const single = jest.fn().mockResolvedValue({ data: null, error: null, ...result });
  const rpc = jest.fn(() => {
    const promise = Promise.resolve({ data: null, error: null, ...result });
    return Object.assign(promise, { single });
  });
  (getSupabase as jest.Mock).mockReturnValue({ rpc });
  return rpc;
}

describe('createEvent, updateEvent, deleteEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[event-form] CA-20: create_event gets ISO instants and the items', async () => {
    const rpc = mockRpc({ data: row() });
    const stored = await createEvent('id-1', input, [{ kind: 'agenda', text: 'Oração' }]);
    expect(rpc).toHaveBeenCalledWith('create_event', {
      p_id: 'id-1',
      p_unit_id: 'icara',
      p_type: 'meeting',
      p_title: 'Conselho',
      p_starts_at: '2026-11-13T22:30:00.000Z',
      p_ends_at: '2026-11-14T00:30:00.000Z',
      p_location: 'Capela',
      p_notes: '',
      p_links: ['https://example.org'],
      p_items: [{ kind: 'agenda', text: 'Oração' }],
    });
    expect(stored.id).toBe('e1');
  });

  it('[event-form] RNF-04: tracks only ids', async () => {
    mockRpc({ data: row() });
    await createEvent('id-1', input, []);
    expect(track).toHaveBeenCalledWith('event_created', { event_id: 'e1', unit_id: 'icara' });
    await updateEvent('e1', input);
    expect(track).toHaveBeenCalledWith('event_updated', { event_id: 'e1', unit_id: 'icara' });
    await deleteEvent('e1');
    expect(track).toHaveBeenCalledWith('event_deleted', { event_id: 'e1' });
    expect(JSON.stringify((track as jest.Mock).mock.calls)).not.toContain('Conselho');
  });

  it.each(['forbidden', 'not_found', 'invalid_items'] as const)(
    '[event-form] maps the %s code of the RPC',
    async (code) => {
      mockRpc({ error: { message: code } });
      await expect(createEvent('id-1', input, [])).rejects.toEqual(new EventWriteError(code));
      await expect(updateEvent('e1', input)).rejects.toEqual(new EventWriteError(code));
      await expect(deleteEvent('e1')).rejects.toEqual(new EventWriteError(code));
    },
  );

  it('[event-form] maps a failed fetch to network and anything else to unknown', async () => {
    const rpc = jest.fn(() => {
      const promise = Promise.reject(new TypeError('Network request failed'));
      promise.catch(() => {});
      return Object.assign(promise, { single: () => promise });
    });
    (getSupabase as jest.Mock).mockReturnValue({ rpc });
    await expect(createEvent('id-1', input, [])).rejects.toEqual(new EventWriteError('network'));
    mockRpc({ error: { message: 'boom' } });
    await expect(deleteEvent('e1')).rejects.toEqual(new EventWriteError('unknown'));
  });
});

describe('useEventCache', () => {
  it('[event-form] saved writes the event and refetches the months; deleted removes it', async () => {
    const client = newClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useEventCache(), { wrapper: wrapper(client) });
    result.current.saved(storedCached as StoredEvent);
    expect(client.getQueryData(eventQueryKey('c1'))).toEqual(storedCached);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['public', 'events', 'month'] });
    result.current.deleted('c1');
    expect(client.getQueryData(eventQueryKey('c1'))).toBeUndefined();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
