import { makeEvent } from '@/test/factories';

import {
  dayBlock,
  dayPart,
  eventsOnDate,
  matchesFilters,
  monthGrid,
  normalizeText,
  shareText,
  unitDots,
  weekOf,
  type EventFilters,
} from './calendar';
import { addMonthsClamped } from './time';

// Instants below are written in UTC; Sao Paulo is UTC-3.
const noFilters: EventFilters = { unitId: null, type: null, search: '' };
const labels = { typeOne: 'Atividade', typeOther: 'Atividades', unitName: 'Estaca' };

describe('normalizeText', () => {
  it('lowercases, strips diacritics and trims', () => {
    expect(normalizeText('  Conferência ÇÃO ')).toBe('conferencia cao');
  });
});

describe('matchesFilters', () => {
  const conference = makeEvent({ title: 'Conferência de Estaca', type: 'conference' });
  const games = makeEvent({ title: 'Noite de jogos', type: 'activity', unitId: 'icara' });

  it('CA-04: search "conferencia" finds Conferência de Estaca and not Noite de jogos', () => {
    const filters = { ...noFilters, search: 'conferencia' };
    expect(matchesFilters(conference, filters, labels)).toBe(true);
    expect(matchesFilters(games, filters, labels)).toBe(false);
  });

  it('RF-04: search also matches type (singular and plural), location and unit name', () => {
    const event = makeEvent({ title: 'X', location: 'Capela de Içara' });
    const search = (text: string, l = labels) =>
      matchesFilters(event, { ...noFilters, search: text }, l);
    expect(search('ATIVIDADES')).toBe(true);
    expect(search('atividade')).toBe(true);
    expect(search('icara')).toBe(true);
    expect(search('estaca')).toBe(true);
    expect(search('nada disso')).toBe(false);
  });

  it('CA-05: unit filter keeps only that unit', () => {
    const filters = { ...noFilters, unitId: 'icara' as const };
    expect(matchesFilters(games, filters, labels)).toBe(true);
    expect(matchesFilters(conference, filters, labels)).toBe(false);
  });

  it('CA-06: type filter keeps only that type', () => {
    const filters = { ...noFilters, type: 'meeting' as const };
    expect(matchesFilters(makeEvent({ type: 'meeting' }), filters, labels)).toBe(true);
    expect(matchesFilters(conference, filters, labels)).toBe(false);
  });

  it('without filters everything matches', () => {
    expect(matchesFilters(games, noFilters, labels)).toBe(true);
  });
});

describe('CA-07: addMonthsClamped', () => {
  it('31/01 plus one month is the last day of February', () => {
    expect(addMonthsClamped({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });
});

describe('eventsOnDate', () => {
  const day = { year: 2026, month: 11, day: 14 };

  it('orders the events of a day by start', () => {
    const late = makeEvent({
      startsAt: new Date('2026-11-14T22:00:00Z'),
      endsAt: new Date('2026-11-14T23:00:00Z'),
    });
    const early = makeEvent({
      startsAt: new Date('2026-11-14T12:00:00Z'),
      endsAt: new Date('2026-11-14T13:00:00Z'),
    });
    expect(eventsOnDate([late, early], day)).toEqual([early, late]);
  });

  it('a event ending at 00:00 does not appear on the next day', () => {
    const night = makeEvent({
      startsAt: new Date('2026-11-14T22:00:00Z'), // 19:00 on 14/11
      endsAt: new Date('2026-11-15T03:00:00Z'), // 00:00 on 15/11
    });
    expect(eventsOnDate([night], day)).toEqual([night]);
    expect(eventsOnDate([night], { year: 2026, month: 11, day: 15 })).toEqual([]);
  });

  it('a multi-day event shows on each day it covers', () => {
    const trip = makeEvent({
      startsAt: new Date('2026-11-14T21:00:00Z'),
      endsAt: new Date('2026-11-16T15:00:00Z'),
    });
    for (const d of [14, 15, 16]) {
      expect(eventsOnDate([trip], { year: 2026, month: 11, day: d })).toEqual([trip]);
    }
    expect(eventsOnDate([trip], { year: 2026, month: 11, day: 17 })).toEqual([]);
  });
});

describe('dayPart', () => {
  // 14/11 18:00 to 16/11 12:00 in Sao Paulo
  const trip = makeEvent({
    startsAt: new Date('2026-11-14T21:00:00Z'),
    endsAt: new Date('2026-11-16T15:00:00Z'),
  });

  it('CA-12: is first, middle and last on 14, 15 and 16/11', () => {
    expect(dayPart(trip, { year: 2026, month: 11, day: 14 })).toBe('first');
    expect(dayPart(trip, { year: 2026, month: 11, day: 15 })).toBe('middle');
    expect(dayPart(trip, { year: 2026, month: 11, day: 16 })).toBe('last');
  });

  it('is single for a one-day event, including one that ends at midnight', () => {
    const night = makeEvent({
      startsAt: new Date('2026-11-14T22:00:00Z'),
      endsAt: new Date('2026-11-15T03:00:00Z'),
    });
    expect(dayPart(night, { year: 2026, month: 11, day: 14 })).toBe('single');
  });
});

describe('monthGrid and weekOf', () => {
  it('November 2026 starts on Sunday 01/11 and has 35 cells', () => {
    const grid = monthGrid({ year: 2026, month: 11, day: 13 });
    expect(grid).toHaveLength(35);
    expect(grid[0]).toEqual({ year: 2026, month: 11, day: 1 });
    expect(grid[34]).toEqual({ year: 2026, month: 12, day: 5 });
  });

  it('uses 42 cells when the month needs six rows', () => {
    // 01/08/2026 is a Saturday: 6 leading cells + 31 days = 37 -> 6 rows
    const grid = monthGrid({ year: 2026, month: 8, day: 1 });
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ year: 2026, month: 7, day: 26 });
  });

  it('keeps at least 5 rows for a four-row February', () => {
    expect(monthGrid({ year: 2026, month: 2, day: 1 })).toHaveLength(35);
  });

  it('weekOf runs Sunday to Saturday', () => {
    const week = weekOf({ year: 2026, month: 11, day: 13 });
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ year: 2026, month: 11, day: 8 });
    expect(week[6]).toEqual({ year: 2026, month: 11, day: 14 });
  });
});

describe('unitDots', () => {
  it('CA-09: four units give three dots in unitOrder', () => {
    const events = [
      makeEvent({ unitId: 'ararangua' }),
      makeEvent({ unitId: 'icara' }),
      makeEvent({ unitId: 'estaca' }),
      makeEvent({ unitId: 'criciuma2' }),
      makeEvent({ unitId: 'icara' }),
    ];
    expect(unitDots(events)).toEqual(['estaca', 'criciuma2', 'icara']);
  });
});

describe('dayBlock', () => {
  const day = { year: 2026, month: 11, day: 13 };

  it('CA-11: an event from 05:00 to 07:00 starts at 06:00 with 60 min', () => {
    const early = makeEvent({
      startsAt: new Date('2026-11-13T08:00:00Z'),
      endsAt: new Date('2026-11-13T10:00:00Z'),
    });
    expect(dayBlock(early, day)).toEqual({ topMinutes: 0, heightMinutes: 60 });
  });

  it('places an event inside the window relative to 06:00', () => {
    const noon = makeEvent({
      startsAt: new Date('2026-11-13T15:00:00Z'), // 12:00
      endsAt: new Date('2026-11-13T16:30:00Z'), // 13:30
    });
    expect(dayBlock(noon, day)).toEqual({ topMinutes: 360, heightMinutes: 90 });
  });

  it('clamps the end to 22:00 and returns null outside the window', () => {
    const late = makeEvent({
      startsAt: new Date('2026-11-14T00:00:00Z'), // 21:00
      endsAt: new Date('2026-11-14T03:00:00Z'), // 00:00
    });
    expect(dayBlock(late, day)).toEqual({ topMinutes: 900, heightMinutes: 60 });
    const dawn = makeEvent({
      startsAt: new Date('2026-11-13T06:00:00Z'), // 03:00
      endsAt: new Date('2026-11-13T08:00:00Z'), // 05:00
    });
    expect(dayBlock(dawn, day)).toBeNull();
  });

  it('a multi-day event fills the window on the middle day', () => {
    const trip = makeEvent({
      startsAt: new Date('2026-11-12T21:00:00Z'),
      endsAt: new Date('2026-11-14T15:00:00Z'),
    });
    expect(dayBlock(trip, day)).toEqual({ topMinutes: 0, heightMinutes: 960 });
  });
});

describe('shareText', () => {
  const event = makeEvent({
    title: 'Conferência de Estaca',
    startsAt: new Date('2026-11-15T12:00:00Z'),
    endsAt: new Date('2026-11-15T15:00:00Z'),
    location: 'Centro de Estaca',
    links: ['https://example.org/a', 'https://example.org/b'],
  });
  const shareLabels = { date: 'Domingo, 15 de novembro de 2026', unitName: 'Estaca' };

  it('CA-16: follows the format of RF-15', () => {
    expect(shareText(event, shareLabels)).toBe(
      [
        'Conferência de Estaca',
        'Domingo, 15 de novembro de 2026 · 09:00–12:00',
        'Centro de Estaca',
        'Estaca',
        'https://example.org/a',
        'https://example.org/b',
      ].join('\n'),
    );
  });

  it('omits the location line when there is no location', () => {
    expect(shareText({ ...event, location: '', links: [] }, shareLabels)).toBe(
      'Conferência de Estaca\nDomingo, 15 de novembro de 2026 · 09:00–12:00\nEstaca',
    );
  });
});
