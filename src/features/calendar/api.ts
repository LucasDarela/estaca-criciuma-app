import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { CalendarEvent } from '@/domain/calendar';
import type { EventInput } from '@/domain/eventForm';
import type { MeetingItemKind } from '@/domain/meetingItems';
import { isEventType, type EventType } from '@/domain/eventTypes';
import { addMonthsClamped, monthKey, monthRange, type CivilDate } from '@/domain/time';
import { isUnitId, type UnitId } from '@/domain/units';
import { PERSIST_MAX_AGE_MS, PUBLIC_STALE_TIME_MS } from '@/lib/queryPersistence';
import { rpcErrorCode } from '@/lib/rpcError';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

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
export function storedFromRow(row: EventRow): StoredEvent | null {
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

export type EventWriteErrorCode =
  'forbidden' | 'not_found' | 'invalid_items' | 'network' | 'unknown';

export class EventWriteError extends Error {
  constructor(readonly code: EventWriteErrorCode) {
    super(code);
    this.name = 'EventWriteError';
  }
}

const eventWriteCodes = ['forbidden', 'not_found', 'invalid_items'] as const;

/** RPCs return a short code in `message`; a failed fetch is `network`; anything else is `unknown`. */
export function toEventWriteError(error: unknown): EventWriteError {
  if (error instanceof EventWriteError) return error;
  return new EventWriteError(rpcErrorCode(error, eventWriteCodes));
}

export type NewMeetingItem = { kind: MeetingItemKind; text: string };

function eventArgs(id: string, input: EventInput) {
  return {
    p_id: id,
    p_unit_id: input.unitId,
    p_type: input.type,
    p_title: input.title,
    p_starts_at: input.startsAt.toISOString(),
    p_ends_at: input.endsAt.toISOString(),
    p_location: input.location,
    p_notes: input.notes,
    p_links: input.links,
  };
}

function storedOrThrow(row: EventRow): StoredEvent {
  const stored = storedFromRow(row);
  if (!stored) throw new EventWriteError('unknown');
  return stored;
}

/**
 * RF-20, RF-21. Creates the event and its first agenda items in one transaction. `id` comes
 * from `Crypto.randomUUID()`, made once per form opening, so a retry never duplicates (CA-21).
 */
export async function createEvent(
  id: string,
  input: EventInput,
  items: readonly NewMeetingItem[],
): Promise<StoredEvent> {
  try {
    const { data, error } = await getSupabase()
      .rpc('create_event', { ...eventArgs(id, input), p_items: [...items] })
      .single();
    if (error) throw error;
    const stored = storedOrThrow(data);
    track('event_created', { event_id: stored.id, unit_id: stored.unitId });
    return stored;
  } catch (error) {
    throw toEventWriteError(error);
  }
}

export async function updateEvent(id: string, input: EventInput): Promise<StoredEvent> {
  try {
    const { data, error } = await getSupabase().rpc('update_event', eventArgs(id, input)).single();
    if (error) throw error;
    const stored = storedOrThrow(data);
    track('event_updated', { event_id: stored.id, unit_id: stored.unitId });
    return stored;
  } catch (error) {
    throw toEventWriteError(error);
  }
}

export async function deleteEvent(id: string): Promise<void> {
  try {
    const { error } = await getSupabase().rpc('delete_event', { p_id: id });
    if (error) throw error;
    track('event_deleted', { event_id: id });
  } catch (error) {
    throw toEventWriteError(error);
  }
}

/**
 * After a save: writes the event query and refetches every month query. After a delete: removes
 * the event query and refetches the months.
 */
export function useEventCache(): {
  saved: (stored: StoredEvent) => void;
  deleted: (id: string) => void;
} {
  const client = useQueryClient();
  const refetchMonths = () =>
    void client.invalidateQueries({ queryKey: ['public', 'events', 'month'] });
  return {
    saved: (stored) => {
      client.setQueryData(eventQueryKey(stored.id), stored);
      refetchMonths();
    },
    deleted: (id) => {
      client.removeQueries({ queryKey: eventQueryKey(id) });
      refetchMonths();
    },
  };
}
