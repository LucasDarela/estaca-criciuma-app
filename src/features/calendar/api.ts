import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { CalendarEvent } from '@/domain/calendar';
import { isEventType, type EventType } from '@/domain/eventTypes';
import { addMonthsClamped, monthKey, monthRange, type CivilDate } from '@/domain/time';
import { isUnitId, type UnitId } from '@/domain/units';
import { PERSIST_MAX_AGE_MS, PUBLIC_STALE_TIME_MS } from '@/lib/queryPersistence';
import { getSupabase } from '@/lib/supabase';

/**
 * An event as kept in the query cache. The persisted cache is JSON, so dates stay ISO strings
 * here and become `Date` in `toCalendarEvent` (a `Date` would come back from disk as a string).
 */
export type StoredEvent = Omit<CalendarEvent, 'startsAt' | 'endsAt'> & {
  startsAt: string;
  endsAt: string;
};

export const eventsMonthQueryKey = (key: string) => ['public', 'events', 'month', key] as const;
export const eventQueryKey = (id: string) => ['public', 'event', id] as const;

const eventColumns = 'id, unit_id, type, title, starts_at, ends_at, location, notes, links';

type EventRow = {
  id: string;
  unit_id: string;
  type: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  notes: string;
  links: string[];
};

/** Rows with an unknown unit or type are dropped (never render unexpected data). */
function storedFromRow(row: EventRow): StoredEvent | null {
  if (!isUnitId(row.unit_id) || !isEventType(row.type)) return null;
  return {
    id: row.id,
    unitId: row.unit_id as UnitId,
    type: row.type as EventType,
    title: row.title,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    location: row.location,
    notes: row.notes,
    links: row.links,
  };
}

export function toCalendarEvent(stored: StoredEvent): CalendarEvent {
  return { ...stored, startsAt: new Date(stored.startsAt), endsAt: new Date(stored.endsAt) };
}

/**
 * Events that overlap the Sao Paulo month `key` ('YYYY-MM'): starts before the month ends and
 * ends after it starts (RNF-03). Throws on any Supabase error.
 */
export async function fetchEventsInMonth(key: string): Promise<StoredEvent[]> {
  const { from, to } = monthRange(key);
  const { data, error } = await getSupabase()
    .from('events')
    .select(eventColumns)
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).flatMap((row) => storedFromRow(row) ?? []);
}

/** One event, or `null` when it does not exist (or was deleted). Throws on a Supabase error. */
export async function fetchEvent(id: string): Promise<StoredEvent | null> {
  const { data, error } = await getSupabase()
    .from('events')
    .select(eventColumns)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? storedFromRow(data) : null;
}

type EventsAround = {
  events: CalendarEvent[];
  status: 'loading' | 'error' | 'success';
  refetch: () => void;
};

/** Merges the three month queries. `status` follows the visible month (the middle one) only. */
function combineMonths(results: UseQueryResult<StoredEvent[]>[]): EventsAround {
  const byId = new Map<string, CalendarEvent>();
  for (const result of results) {
    for (const stored of result.data ?? []) byId.set(stored.id, toCalendarEvent(stored));
  }
  const current = results[1];
  const status =
    current.data !== undefined
      ? 'success'
      : current.isError || current.fetchStatus === 'paused'
        ? 'error'
        : 'loading';
  return {
    events: [...byId.values()],
    status,
    refetch: () => {
      for (const result of results) void result.refetch();
    },
  };
}

/**
 * Events of the visible month and of the months around it (one query per month, so changing the
 * period is almost always a cache hit, RNF-05). `status` is 'loading' until the visible month has
 * data and 'error' when it failed (or cannot load offline) with nothing cached.
 */
export function useEventsAround(visible: CivilDate): EventsAround {
  const keys = [-1, 0, 1].map((offset) => monthKey(addMonthsClamped(visible, offset)));
  return useQueries({
    queries: keys.map((key) => ({
      queryKey: eventsMonthQueryKey(key),
      queryFn: () => fetchEventsInMonth(key),
      staleTime: PUBLIC_STALE_TIME_MS,
      // Must outlive the persisted cache's maxAge or it is garbage-collected before it is saved.
      gcTime: PERSIST_MAX_AGE_MS,
    })),
    combine: combineMonths,
  });
}

export function useEvent(id: string): UseQueryResult<CalendarEvent | null> {
  const client = useQueryClient();
  return useQuery({
    queryKey: eventQueryKey(id),
    queryFn: () => fetchEvent(id),
    staleTime: PUBLIC_STALE_TIME_MS,
    gcTime: PERSIST_MAX_AGE_MS,
    // The month queries usually have it already: the detail opens without a spinner.
    placeholderData: () => {
      const months = client.getQueriesData<StoredEvent[]>({
        queryKey: ['public', 'events', 'month'],
      });
      for (const [, events] of months) {
        const found = events?.find((event) => event.id === id);
        if (found) return found;
      }
      return undefined;
    },
    select: (stored) => (stored ? toCalendarEvent(stored) : null),
  });
}
