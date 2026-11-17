import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { isMeetingItemKind, type MeetingItem, type MeetingItemKind } from '@/domain/meetingItems';
import type { CivilDate } from '@/domain/time';
import { getSupabase } from '@/lib/supabase';

import { toEventWriteError } from './api';

/** RNF-02: never under 'public', so the agenda never reaches the persisted cache. */
export const meetingItemsQueryKey = (eventId: string) => ['meeting', eventId] as const;

function civilFromIso(value: string | null): CivilDate | null {
  if (value === null) return null;
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** Items in position order; rows with an unknown kind are dropped. */
export async function fetchMeetingItems(eventId: string): Promise<MeetingItem[]> {
  const { data, error } = await getSupabase()
    .from('meeting_items')
    .select('id, kind, text, carried_from_date')
    .eq('event_id', eventId)
    .order('position')
    .order('created_at')
    .order('id');
  if (error) throw toEventWriteError(error);
  return (data ?? []).flatMap((row) =>
    isMeetingItemKind(row.kind)
      ? [
          {
            id: row.id,
            kind: row.kind,
            text: row.text,
            carriedFromDate: civilFromIso(row.carried_from_date),
          },
        ]
      : [],
  );
}

export function useMeetingItems(
  eventId: string | null,
  enabled: boolean,
): UseQueryResult<MeetingItem[]> {
  return useQuery({
    queryKey: meetingItemsQueryKey(eventId ?? ''),
    queryFn: () => fetchMeetingItems(eventId as string),
    enabled: enabled && eventId !== null,
  });
}

/** RF-20. `position` and `created_by` come from database defaults. */
export async function addMeetingItem(
  eventId: string,
  kind: MeetingItemKind,
  text: string,
): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from('meeting_items')
      .insert({ event_id: eventId, kind, text: text.trim() });
    if (error) throw error;
  } catch (error) {
    throw toEventWriteError(error);
  }
}

export async function removeMeetingItem(id: string): Promise<void> {
  try {
    const { error } = await getSupabase().from('meeting_items').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toEventWriteError(error);
  }
}
