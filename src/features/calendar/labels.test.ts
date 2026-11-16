import i18n from '@/i18n';
import { makeEvent } from '@/test/factories';

import {
  dateRange,
  dayLabel,
  eventDateLabel,
  eventTimeLabel,
  longDate,
  monthLabel,
  spokenDate,
  summaryParts,
  weekLabel,
} from './labels';

const t = i18n.getFixedT('pt-BR');
const date = { year: 2026, month: 11, day: 13 };

describe('period labels (RF-07)', () => {
  it('formats the month, week and day labels like the spec in pt-BR', () => {
    expect(monthLabel(date, 'pt-BR')).toBe('Novembro 2026');
    expect(
      weekLabel({ year: 2026, month: 11, day: 8 }, { year: 2026, month: 11, day: 14 }, 'pt-BR'),
    ).toBe('8 nov – 14 nov');
    expect(dayLabel(date, 'pt-BR')).toBe('Sex, 13 nov');
  });

  it('follows the active locale', () => {
    expect(monthLabel(date, 'en-US')).toBe('November 2026');
    expect(monthLabel(date, 'es-MX')).toBe('Noviembre 2026');
  });

  it('formats the long dates of the summary and the detail', () => {
    expect(summaryParts(date, 'pt-BR')).toEqual({
      weekday: 'Sexta-feira',
      day: '13',
      month: 'novembro',
    });
    expect(spokenDate(date, 'pt-BR')).toBe('13 de novembro');
    expect(longDate(date, 'pt-BR')).toBe('Sexta-feira, 13 de novembro de 2026');
    expect(dateRange(date, { year: 2026, month: 11, day: 16 }, 'pt-BR')).toBe(
      '13 de novembro – 16 de novembro de 2026',
    );
  });
});

describe('eventTimeLabel (RF-11)', () => {
  const event = makeEvent({
    type: 'caravan',
    startsAt: new Date('2026-11-14T21:00:00Z'),
    endsAt: new Date('2026-11-16T15:00:00Z'),
  });

  it('CA-12: shows the start, "Dia todo" and "até" across the days', () => {
    expect(eventTimeLabel(event, 'first', t)).toBe('18:00 · Caravana');
    expect(eventTimeLabel(event, 'middle', t)).toBe('Dia todo · Caravana');
    expect(eventTimeLabel(event, 'last', t)).toBe('até 12:00 · Caravana');
  });

  it('shows the range for a single-day event', () => {
    const single = makeEvent({
      type: 'meeting',
      startsAt: new Date('2026-11-13T22:00:00Z'),
      endsAt: new Date('2026-11-14T00:00:00Z'),
    });
    expect(eventTimeLabel(single, 'single', t)).toBe('19:00–21:00 · Reunião');
  });
});

describe('eventDateLabel', () => {
  it('uses one long date for a single-day event', () => {
    const single = makeEvent({
      startsAt: new Date('2026-11-13T22:00:00Z'),
      endsAt: new Date('2026-11-14T02:00:00Z'),
    });
    expect(eventDateLabel(single, 'pt-BR')).toBe('Sexta-feira, 13 de novembro de 2026');
  });

  it('uses a range for a multi-day event', () => {
    const trip = makeEvent({
      startsAt: new Date('2026-11-14T21:00:00Z'),
      endsAt: new Date('2026-11-16T15:00:00Z'),
    });
    expect(eventDateLabel(trip, 'pt-BR')).toBe('14 de novembro – 16 de novembro de 2026');
  });
});
