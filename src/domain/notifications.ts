import { addDays, civilDateOf, formatCivil, formatTime, sameDate } from './time';
import { unitIds, type UnitId } from './units';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 90;

export type InboxSection = 'today' | 'thisWeek' | 'earlier';
const sectionOrder: readonly InboxSection[] = ['today', 'thisWeek', 'earlier'];

/**
 * RF-14. Civil dates of Sao Paulo: today, 1 to 6 days before, up to 90 days; null beyond that.
 * An instant in the future counts as today.
 */
export function inboxSection(at: Date, now: Date): InboxSection | null {
  if (at.getTime() <= now.getTime() - HISTORY_DAYS * MS_PER_DAY) return null;
  const day = civilDateOf(at);
  const today = civilDateOf(now);
  if (at.getTime() >= now.getTime() || sameDate(day, today)) return 'today';
  for (let back = 1; back <= 6; back += 1) {
    if (sameDate(day, addDays(today, -back))) return 'thisWeek';
  }
  return 'earlier';
}

/** Fixed section order, empty sections omitted, items newest first. */
export function groupBySection<T extends { at: Date }>(
  items: readonly T[],
  now: Date,
): { section: InboxSection; items: T[] }[] {
  const sorted = [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
  return sectionOrder
    .map((section) => ({
      section,
      items: sorted.filter((item) => inboxSection(item.at, now) === section),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * RF-11. "Saturday, November 21 · 15:00 · Place", in the given locale. Same output as
 * `eventPushBody` in `supabase/functions/_shared/pushContent.ts` (the same test vectors run on both).
 */
export function eventPushBody(startsAt: Date, location: string, locale: string): string {
  const day = formatCivil(civilDateOf(startsAt), locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const label = day.charAt(0).toUpperCase() + day.slice(1);
  const place = location.trim();
  return place
    ? `${label} · ${formatTime(startsAt)} · ${place}`
    : `${label} · ${formatTime(startsAt)}`;
}

export type ReminderEntry = { noteId: string; title: string; fireAt: string }; // fireAt is ISO

/** RF-20. Reminders that already fired, within the last 90 days. */
export function dueReminders(entries: readonly ReminderEntry[], now: Date): ReminderEntry[] {
  const oldest = now.getTime() - HISTORY_DAYS * MS_PER_DAY;
  return entries.filter((entry) => {
    const at = new Date(entry.fireAt).getTime();
    return at <= now.getTime() && at > oldest;
  });
}

export type PrefToggle = {
  key: 'estaca' | 'home' | 'others' | UnitId;
  units: UnitId[];
  on: boolean;
};

/**
 * RF-17. With a home unit: Estaca, the home unit and the other 5 together. Without one: Estaca
 * and one switch per unit. `on` of a group means every unit of the group is subscribed.
 */
export function prefToggles(units: readonly UnitId[], homeUnitId: UnitId | null): PrefToggle[] {
  const make = (key: PrefToggle['key'], group: UnitId[]): PrefToggle => ({
    key,
    units: group,
    on: group.every((id) => units.includes(id)),
  });
  const withoutStake = unitIds.filter((id) => id !== 'estaca');
  if (homeUnitId === null) {
    return [make('estaca', ['estaca']), ...withoutStake.map((id) => make(id, [id]))];
  }
  return [
    make('estaca', ['estaca']),
    make('home', [homeUnitId]),
    make(
      'others',
      withoutStake.filter((id) => id !== homeUnitId),
    ),
  ];
}

/** Subscribes or unsubscribes the units of the toggle. The result follows the order of `unitIds`. */
export function applyToggle(units: readonly UnitId[], toggle: PrefToggle, on: boolean): UnitId[] {
  const next = new Set(units);
  for (const id of toggle.units) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return unitIds.filter((id) => next.has(id));
}
