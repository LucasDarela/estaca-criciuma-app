import {
  addDays,
  addMonthsClamped,
  civilDateOf,
  formatCivil,
  formatTime,
  instantOf,
  monthKey,
  monthRange,
  sameDate,
  startOfCivilDay,
  toSaoPauloWallTime,
  weekdayOf,
} from './time';

describe('time (Sao Paulo, fixed UTC-3, ADR 0005)', () => {
  it('runs the suite on a machine zone that is not Sao Paulo', () => {
    expect(process.env.TZ).toBe('Europe/Lisbon');
  });

  it('CA-20: converts 22:30Z to 19:30 in Sao Paulo regardless of the machine zone', () => {
    const instant = new Date('2026-11-13T22:30:00Z');
    expect(toSaoPauloWallTime(instant)).toEqual({
      year: 2026,
      month: 11,
      day: 13,
      hour: 19,
      minute: 30,
    });
    expect(formatTime(instant)).toBe('19:30');
  });

  it('formats times with a 24 h clock', () => {
    expect(formatTime(new Date('2026-11-13T03:05:00Z'))).toBe('00:05');
  });

  it('civilDateOf rolls the day back before 03:00Z', () => {
    expect(civilDateOf(new Date('2026-11-13T02:59:00Z'))).toEqual({
      year: 2026,
      month: 11,
      day: 12,
    });
  });

  it('startOfCivilDay is 03:00Z of that date', () => {
    expect(startOfCivilDay({ year: 2026, month: 11, day: 13 }).toISOString()).toBe(
      '2026-11-13T03:00:00.000Z',
    );
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addDays({ year: 2026, month: 11, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 10,
      day: 31,
    });
  });

  it('addMonthsClamped clamps to the last day of the target month', () => {
    expect(addMonthsClamped({ year: 2027, month: 1, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
    expect(addMonthsClamped({ year: 2028, month: 1, day: 31 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(addMonthsClamped({ year: 2026, month: 12, day: 15 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 15,
    });
    expect(addMonthsClamped({ year: 2026, month: 1, day: 15 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 15,
    });
  });

  it('weekdayOf returns 0 for Sunday', () => {
    expect(weekdayOf({ year: 2026, month: 11, day: 1 })).toBe(0);
    expect(weekdayOf({ year: 2026, month: 11, day: 13 })).toBe(5);
  });

  it('sameDate and monthKey', () => {
    expect(sameDate({ year: 2026, month: 11, day: 1 }, { year: 2026, month: 11, day: 1 })).toBe(
      true,
    );
    expect(sameDate({ year: 2026, month: 11, day: 1 }, { year: 2026, month: 11, day: 2 })).toBe(
      false,
    );
    expect(monthKey({ year: 2026, month: 3, day: 9 })).toBe('2026-03');
  });

  it('monthRange spans the month in Sao Paulo', () => {
    const { from, to } = monthRange('2026-11');
    expect(from.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(monthRange('2026-12').to.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('formatCivil labels a civil date without depending on the machine zone', () => {
    const date = { year: 2026, month: 11, day: 13 };
    expect(formatCivil(date, 'pt-BR', { weekday: 'short' }).toLowerCase()).toContain('sex');
    expect(formatCivil(date, 'en-US', { day: 'numeric' })).toBe('13');
  });

  it('CA-20: instantOf turns 19:30 in Sao Paulo into 22:30Z and round-trips', () => {
    const wall = { year: 2026, month: 11, day: 12, hour: 19, minute: 30 };
    const instant = instantOf(wall);
    expect(instant.toISOString()).toBe('2026-11-12T22:30:00.000Z');
    expect(toSaoPauloWallTime(instant)).toEqual(wall);
  });
});
