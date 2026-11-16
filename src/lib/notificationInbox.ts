import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  dueReminders,
  eventPushBody,
  inboxSection,
  type ReminderEntry,
} from '@/domain/notifications';
import { isUnitId, type UnitId } from '@/domain/units';
import i18n from '@/i18n';

import { useAuthSession } from './authSession';
import { getDevicePushToken } from './push';
import { readReminderLog } from './reminderLog';
import { getSupabase } from './supabase';

export type InboxItem = {
  /** The notification uuid, or `reminder:<noteId>:<fireAt>`. */
  id: string;
  kind: 'event' | 'post' | 'reminder';
  /** The event, post or note the item opens. */
  itemId: string;
  unitId: UnitId | null;
  title: string;
  /** Events: built in the app language (decision P2). */
  body: string;
  at: Date;
  read: boolean;
};

/** Never starts with 'public': this is personal data and must not reach the persisted cache. */
export const inboxQueryKey = (userId: string | null) => ['inbox', userId ?? 'visitor'] as const;

const READ_STORAGE_KEY = 'notifications.read.v1';
const INBOX_STALE_TIME_MS = 60 * 1000;

async function readLocalRead(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

async function writeLocalRead(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...ids]));
}

const reminderId = (entry: ReminderEntry) => `reminder:${entry.noteId}:${entry.fireAt}`;

async function fetchNotifications(token: string | null, signedIn: boolean) {
  // Without a device token and without an account there is nobody to look up.
  if (!token && !signedIn) return [];
  const { data, error } = await getSupabase().rpc('my_notifications', {
    ...(token ? { p_device_token: token } : {}),
  });
  if (error) throw error;
  return data ?? [];
}

/** RF-14, RF-20: server history plus the reminders that already fired, newest first. */
export async function fetchInbox(userId: string | null, now: Date): Promise<InboxItem[]> {
  const token = await getDevicePushToken();
  const [rows, reminders, localRead] = await Promise.all([
    fetchNotifications(token, userId !== null),
    readReminderLog(),
    readLocalRead(),
  ]);

  const items: InboxItem[] = [];
  for (const row of rows) {
    if (row.kind !== 'event' && row.kind !== 'post') continue;
    const at = new Date(row.created_at);
    const startsAt = row.event_starts_at ? new Date(row.event_starts_at) : null;
    items.push({
      id: row.id,
      kind: row.kind,
      itemId: row.item_id,
      unitId: isUnitId(row.unit_id) ? row.unit_id : null,
      title: row.title,
      body:
        row.kind === 'event' && startsAt
          ? eventPushBody(startsAt, row.event_location ?? '', i18n.language)
          : row.body,
      at,
      // Signed in: the server knows (per person). Visitor: ids kept on the device.
      read: userId ? row.read : localRead.has(row.id),
    });
  }
  for (const entry of dueReminders(reminders, now)) {
    items.push({
      id: reminderId(entry),
      kind: 'reminder',
      itemId: entry.noteId,
      unitId: null,
      title: entry.title,
      body: '',
      at: new Date(entry.fireAt),
      read: localRead.has(reminderId(entry)),
    });
  }

  const visible = items
    .filter((item) => inboxSection(item.at, now) !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  // Prune read ids that left the 90 day window so the local list does not grow forever.
  const live = new Set(visible.map((item) => item.id));
  const kept = new Set([...localRead].filter((id) => live.has(id)));
  if (kept.size !== localRead.size) await writeLocalRead(kept);
  return visible;
}

export function useInbox(): UseQueryResult<InboxItem[]> {
  const session = useAuthSession();
  const userId = session.status === 'signedIn' ? session.userId : null;
  return useQuery({
    queryKey: inboxQueryKey(userId),
    queryFn: () => fetchInbox(userId, new Date()),
    staleTime: INBOX_STALE_TIME_MS,
  });
}

export function useHasUnread(): boolean {
  const { data } = useInbox();
  return data?.some((item) => !item.read) ?? false;
}

/**
 * RF-14, RF-16. Marks items as read; `null` means every unread one. Signed in: notifications go to
 * `mark_notifications_read` (per person), reminders stay local. Visitor: everything is local.
 * The cached inbox is updated at once and then refetched.
 */
export async function markRead(
  ids: string[] | null,
  items: readonly InboxItem[],
  client: QueryClient,
): Promise<void> {
  const targets = items.filter((item) => !item.read && (ids === null || ids.includes(item.id)));
  if (targets.length === 0) return;

  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const signedIn = data.session !== null;

  const local = targets.filter((item) => !signedIn || item.kind === 'reminder');
  const remote = signedIn ? targets.filter((item) => item.kind !== 'reminder') : [];

  if (remote.length > 0) {
    const { error } = await supabase.rpc(
      'mark_notifications_read',
      ids === null ? {} : { p_ids: remote.map((item) => item.id) },
    );
    if (error) throw error;
  }
  if (local.length > 0) {
    const stored = await readLocalRead();
    local.forEach((item) => stored.add(item.id));
    await writeLocalRead(stored);
  }

  const done = new Set(targets.map((item) => item.id));
  client.setQueriesData<InboxItem[]>({ queryKey: ['inbox'] }, (current) =>
    current?.map((item) => (done.has(item.id) ? { ...item, read: true } : item)),
  );
  await client.invalidateQueries({ queryKey: ['inbox'] });
}

/** `markRead` bound to the app query client, for screens and effects. */
export function useMarkRead(): (
  ids: string[] | null,
  items: readonly InboxItem[],
) => Promise<void> {
  const client = useQueryClient();
  return (ids, items) => markRead(ids, items, client);
}

/** RF-16. An event that was deleted is gone; posts and notes arrive with their own specs. */
export async function itemExists(kind: InboxItem['kind'], itemId: string): Promise<boolean> {
  if (kind !== 'event') return true;
  const { data, error } = await getSupabase()
    .from('events')
    .select('id')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
