import { isPublicQueryKey } from '@/lib/queryPersistence';
import { getSupabase } from '@/lib/supabase';

import { EventWriteError } from './api';
import {
  addMeetingItem,
  fetchMeetingItems,
  meetingItemsQueryKey,
  removeMeetingItem,
} from './meetingApi';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

type Result = { data: unknown; error: unknown };

function mockTable(result: Result) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'order', 'insert', 'delete']) {
    chain[name] = (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return chain;
    };
  }
  chain.then = (resolve: (value: Result) => unknown) => resolve(result);
  const from = jest.fn(() => chain);
  (getSupabase as jest.Mock).mockReturnValue({ from });
  return { calls, from };
}

beforeEach(() => jest.clearAllMocks());

describe('meeting items api', () => {
  it('[event-form] RNF-02: the query key is not persisted (does not start with public)', () => {
    expect(isPublicQueryKey(meetingItemsQueryKey('e1'))).toBe(false);
  });

  it('[event-form] RF-19: orders by position, created_at and id and converts the carried date', async () => {
    const { calls, from } = mockTable({
      data: [
        { id: 'a', kind: 'agenda', text: 'Definir recepção', carried_from_date: '2026-10-15' },
        { id: 'b', kind: 'pending', text: 'Pendência', carried_from_date: null },
        { id: 'c', kind: 'mystery', text: 'x', carried_from_date: null },
      ],
      error: null,
    });
    const items = await fetchMeetingItems('e1');
    expect(from).toHaveBeenCalledWith('meeting_items');
    expect(calls.eq).toEqual([['event_id', 'e1']]);
    expect(calls.order).toEqual([['position'], ['created_at'], ['id']]);
    expect(items).toEqual([
      {
        id: 'a',
        kind: 'agenda',
        text: 'Definir recepção',
        carriedFromDate: { year: 2026, month: 10, day: 15 },
      },
      { id: 'b', kind: 'pending', text: 'Pendência', carriedFromDate: null },
    ]);
  });

  it('[event-form] RF-20: adds a trimmed item without position or author (database defaults)', async () => {
    const { calls } = mockTable({ data: null, error: null });
    await addMeetingItem('e1', 'agenda', '  Oração ');
    expect(calls.insert).toEqual([[{ event_id: 'e1', kind: 'agenda', text: 'Oração' }]]);
  });

  it('[event-form] RF-20: removes an item by id', async () => {
    const { calls } = mockTable({ data: null, error: null });
    await removeMeetingItem('a');
    expect(calls.eq).toEqual([['id', 'a']]);
  });

  it('[event-form] maps errors to EventWriteError', async () => {
    mockTable({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(addMeetingItem('e1', 'agenda', 'x')).rejects.toEqual(
      new EventWriteError('unknown'),
    );
  });
});
