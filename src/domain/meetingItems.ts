import type { CivilDate } from './time';

export type MeetingItemKind = 'agenda' | 'decision' | 'pending';

export const meetingItemKinds: readonly MeetingItemKind[] = ['agenda', 'decision', 'pending'];

export const MEETING_ITEM_MAX = 300;

export type MeetingItem = {
  /** A local id ('local-<n>') for the items of a new event. */
  id: string;
  kind: MeetingItemKind;
  text: string;
  carriedFromDate: CivilDate | null;
};

export function isMeetingItemKind(value: string): value is MeetingItemKind {
  return (meetingItemKinds as readonly string[]).includes(value);
}

export function countByKind(items: readonly MeetingItem[]): Record<MeetingItemKind, number> {
  const counts: Record<MeetingItemKind, number> = { agenda: 0, decision: 0, pending: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** Items of one kind, keeping the given order (already position order from the API). */
export function itemsOfKind(items: readonly MeetingItem[], kind: MeetingItemKind): MeetingItem[] {
  return items.filter((item) => item.kind === kind);
}

/** 'dd/mm' (RF-19 tag). */
export function shortDate({ day, month }: CivilDate): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}
