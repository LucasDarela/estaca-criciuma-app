import type { TFunction } from 'i18next';

import type { CalendarEvent, DayPart } from '@/domain/calendar';
import { formatCivil, formatTime, type CivilDate } from '@/domain/time';

function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Drops the abbreviation dots and the "de" that Intl adds, so "8 de nov." reads "8 nov". */
function plain(text: string): string {
  return text.replace(/\./g, '').replace(/\bde /g, '');
}

/** Month period label: "Novembro 2026". */
export function monthLabel(date: CivilDate, locale: string): string {
  return capitalize(plain(formatCivil(date, locale, { month: 'long', year: 'numeric' })), locale);
}

/** Week period label: "8 nov – 14 nov". */
export function weekLabel(first: CivilDate, last: CivilDate, locale: string): string {
  const short = (date: CivilDate) =>
    plain(formatCivil(date, locale, { day: 'numeric', month: 'short' }));
  return `${short(first)} – ${short(last)}`;
}

/** Day period label and week group title: "Sex, 13 nov". */
export function dayLabel(date: CivilDate, locale: string): string {
  return capitalize(
    plain(formatCivil(date, locale, { weekday: 'short', day: 'numeric', month: 'short' })),
    locale,
  );
}

/** Spoken date of a grid day: "13 de novembro". */
export function spokenDate(date: CivilDate, locale: string): string {
  return formatCivil(date, locale, { day: 'numeric', month: 'long' });
}

/** Parts of the month summary line: "Sexta-feira" / "13" / "novembro". */
export function summaryParts(
  date: CivilDate,
  locale: string,
): { weekday: string; day: string; month: string } {
  return {
    weekday: capitalize(formatCivil(date, locale, { weekday: 'long' }), locale),
    day: formatCivil(date, locale, { day: 'numeric' }),
    month: formatCivil(date, locale, { month: 'long' }),
  };
}

/** Detail date (RF-12): "Sexta-feira, 13 de novembro de 2026". */
export function longDate(date: CivilDate, locale: string): string {
  return capitalize(
    formatCivil(date, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    locale,
  );
}

/** Detail date of a multi-day event (RF-12): "14 de novembro – 16 de novembro de 2026". */
export function dateRange(first: CivilDate, last: CivilDate, locale: string): string {
  return `${formatCivil(first, locale, { day: 'numeric', month: 'long' })} – ${formatCivil(last, locale, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** First line of an EventCard (RF-11): the time part depends on the day of a multi-day event. */
export function eventTimeLabel(event: CalendarEvent, part: DayPart, t: TFunction): string {
  const type = t(`calendar.types.${event.type}.one`);
  const time =
    part === 'single'
      ? `${formatTime(event.startsAt)}–${formatTime(event.endsAt)}`
      : part === 'first'
        ? formatTime(event.startsAt)
        : part === 'middle'
          ? t('calendar.allDay')
          : t('calendar.until', { time: formatTime(event.endsAt) });
  return `${time} · ${type}`;
}

/** Screen reader label of a day button (RNF-07): "Hoje, 13 de novembro, 2 eventos". */
export function dayA11yLabel(
  date: CivilDate,
  count: number,
  isToday: boolean,
  locale: string,
  t: TFunction,
): string {
  const spoken = spokenDate(date, locale);
  const label =
    count === 0
      ? t('calendar.a11y.dayNone', { date: spoken })
      : t('calendar.a11y.day', { date: spoken, count });
  return isToday ? `${t('calendar.a11y.todayPrefix')}${label}` : label;
}
