/**
 * Civil dates and wall-clock times in Sao Paulo, using the fixed UTC-3 offset (ADR 0005).
 * Brazil has had no DST since 2019. Business rules and display never use the local getters of
 * `Date` (they follow the device zone); everything goes through this module.
 */
export const SAO_PAULO_OFFSET_MINUTES = -180;

const MS_PER_MINUTE = 60_000;

export type CivilDate = { year: number; month: number; day: number }; // month 1-12
export type WallTime = CivilDate & { hour: number; minute: number };

/** The UTC fields of the shifted date are the Sao Paulo wall clock. */
function shifted(instant: Date): Date {
  return new Date(instant.getTime() + SAO_PAULO_OFFSET_MINUTES * MS_PER_MINUTE);
}

function utcNoon({ year, month, day }: CivilDate): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function fromUtcFields(date: Date): CivilDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function toSaoPauloWallTime(instant: Date): WallTime {
  const wall = shifted(instant);
  return { ...fromUtcFields(wall), hour: wall.getUTCHours(), minute: wall.getUTCMinutes() };
}

export function civilDateOf(instant: Date): CivilDate {
  return fromUtcFields(shifted(instant));
}

/** The instant of 00:00 of the date in Sao Paulo. */
export function startOfCivilDay({ year, month, day }: CivilDate): Date {
  return new Date(Date.UTC(year, month - 1, day) - SAO_PAULO_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromUtcFields(new Date(Date.UTC(date.year, date.month - 1, date.day + days)));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 31/01 + 1 month gives the last day of February (28 or 29). */
export function addMonthsClamped(date: CivilDate, months: number): CivilDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** 0 = Sunday. */
export function weekdayOf(date: CivilDate): number {
  return utcNoon(date).getUTCDay();
}

export function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function monthKey({ year, month }: CivilDate): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** [day 1 00:00, next month day 1 00:00) in Sao Paulo, for a 'YYYY-MM' key. */
export function monthRange(key: string): { from: Date; to: Date } {
  const [year, month] = key.split('-').map(Number);
  const first: CivilDate = { year, month, day: 1 };
  return {
    from: startOfCivilDay(first),
    to: startOfCivilDay(addMonthsClamped(first, 1)),
  };
}

/** 'HH:mm', 24 h in every locale. */
export function formatTime(instant: Date): string {
  const { hour, minute } = toSaoPauloWallTime(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Locale label of a civil date. Formats the date as noon UTC with `timeZone: 'UTC'` so the
 * device zone cannot move the day.
 */
export function formatCivil(
  date: CivilDate,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(utcNoon(date));
}
