import type { EventType } from './eventTypes';
import {
  addDays,
  civilDateOf,
  formatTime,
  sameDate,
  startOfCivilDay,
  weekdayOf,
  type CivilDate,
} from './time';
import { unitIds, type UnitId } from './units';

export type CalendarEvent = {
  id: string;
  unitId: UnitId;
  type: EventType;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  notes: string;
  links: string[];
};

export type EventFilters = { unitId: UnitId | null; type: EventType | null; search: string };

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** Lowercase, without diacritics, trimmed: the form used to compare search text (RF-04). */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** RF-04, RF-05, RF-06. Labels are already translated by the caller (domain has no i18n). */
export function matchesFilters(
  event: CalendarEvent,
  filters: EventFilters,
  labels: { typeOne: string; typeOther: string; unitName: string },
): boolean {
  if (filters.unitId !== null && event.unitId !== filters.unitId) return false;
  if (filters.type !== null && event.type !== filters.type) return false;
  const query = normalizeText(filters.search);
  if (query === '') return true;
  return [event.title, labels.typeOne, labels.typeOther, event.location, labels.unitName].some(
    (field) => normalizeText(field).includes(query),
  );
}

/** Events that overlap the civil day (`ends_at` exclusive), ordered by start. */
export function eventsOnDate(events: readonly CalendarEvent[], date: CivilDate): CalendarEvent[] {
  const dayStart = startOfCivilDay(date).getTime();
  const dayEnd = startOfCivilDay(addDays(date, 1)).getTime();
  return events
    .filter((event) => event.startsAt.getTime() < dayEnd && event.endsAt.getTime() > dayStart)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type DayPart = 'single' | 'first' | 'middle' | 'last';

/** Which part of a (possibly multi-day) event the date shows (RF-11). */
export function dayPart(event: CalendarEvent, date: CivilDate): DayPart {
  const firstDay = civilDateOf(event.startsAt);
  // `ends_at` is exclusive: an event ending at 00:00 belongs to the previous day.
  const lastDay = civilDateOf(new Date(event.endsAt.getTime() - 1));
  if (sameDate(firstDay, lastDay)) return 'single';
  if (sameDate(date, firstDay)) return 'first';
  if (sameDate(date, lastDay)) return 'last';
  return 'middle';
}

/** Month grid starting on Sunday (A4): 35 or 42 cells, with days of the neighbouring months. */
export function monthGrid(month: CivilDate): CivilDate[] {
  const first: CivilDate = { year: month.year, month: month.month, day: 1 };
  const lead = weekdayOf(first);
  const days = addDays({ year: month.year, month: month.month + 1, day: 1 }, -1).day;
  const rows = Math.max(5, Math.ceil((lead + days) / 7));
  const start = addDays(first, -lead);
  return Array.from({ length: rows * 7 }, (_, index) => addDays(start, index));
}

/** The 7 days of the week of `date`, Sunday to Saturday. */
export function weekOf(date: CivilDate): CivilDate[] {
  const start = addDays(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Distinct units of the events, in `unitOrder`, at most 3 (CA-09). */
export function unitDots(events: readonly CalendarEvent[]): UnitId[] {
  const present = new Set(events.map((event) => event.unitId));
  return unitIds.filter((id) => present.has(id)).slice(0, 3);
}

export const DAY_WINDOW = { startHour: 6, endHour: 22 } as const;

/**
 * Position of an event in the day timeline, in minutes after 06:00, clamped to 06:00-22:00
 * (RF-10, CA-11). `null` when the event does not touch the window on that date.
 */
export function dayBlock(
  event: CalendarEvent,
  date: CivilDate,
): { topMinutes: number; heightMinutes: number } | null {
  const dayStart = startOfCivilDay(date).getTime();
  const windowStart = dayStart + DAY_WINDOW.startHour * MS_PER_HOUR;
  const windowEnd = dayStart + DAY_WINDOW.endHour * MS_PER_HOUR;
  const start = Math.max(event.startsAt.getTime(), windowStart);
  const end = Math.min(event.endsAt.getTime(), windowEnd);
  if (end <= start) return null;
  return {
    topMinutes: (start - windowStart) / MS_PER_MINUTE,
    heightMinutes: (end - start) / MS_PER_MINUTE,
  };
}

/**
 * Text for the share sheet (RF-15): title, "date · start-end", location, unit, then one link per
 * line. `labels.date` is the already formatted date. A blank location line is left out.
 */
export function shareText(
  event: CalendarEvent,
  labels: { date: string; unitName: string },
): string {
  const range = `${formatTime(event.startsAt)}–${formatTime(event.endsAt)}`;
  return [event.title, `${labels.date} · ${range}`, event.location, labels.unitName, ...event.links]
    .filter((line, index) => index !== 2 || line !== '')
    .join('\n');
}
