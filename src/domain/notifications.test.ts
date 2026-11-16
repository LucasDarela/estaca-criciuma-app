import {
  applyToggle,
  dueReminders,
  eventPushBody,
  groupBySection,
  inboxSection,
  prefToggles,
} from './notifications';
import { unitIds } from './units';

const now = new Date('2026-11-15T15:00:00Z'); // 12:00 in Sao Paulo, a Sunday
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe('eventPushBody', () => {
  const startsAt = new Date('2026-11-21T18:00:00Z'); // 15:00 in Sao Paulo

  it('CA-11: pt-BR body with weekday, date, time and place', () => {
    expect(eventPushBody(startsAt, 'Capela do Ramo Gaivota', 'pt-BR')).toBe(
      'Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota',
    );
  });

  it('CA-11: without a place the body ends at the time', () => {
    expect(eventPushBody(startsAt, '', 'pt-BR')).toBe('Sábado, 21 de novembro · 15:00');
    expect(eventPushBody(startsAt, '  ', 'pt-BR')).toBe('Sábado, 21 de novembro · 15:00');
  });

  it('CA-11: en-US and es-MX start with a capital letter', () => {
    expect(eventPushBody(startsAt, 'Chapel', 'en-US')).toBe(
      'Saturday, November 21 · 15:00 · Chapel',
    );
    expect(eventPushBody(startsAt, 'Capilla', 'es-MX')).toMatch(/^Sábado, 21 de noviembre · 15:00/);
  });

  it('uses the Sao Paulo day near midnight', () => {
    expect(eventPushBody(new Date('2026-11-22T02:30:00Z'), '', 'pt-BR')).toBe(
      'Sábado, 21 de novembro · 23:30',
    );
  });
});

describe('inboxSection', () => {
  it('CA-15: today, this week, earlier and out of the 90 days', () => {
    expect(inboxSection(new Date('2026-11-15T13:00:00Z'), now)).toBe('today');
    expect(inboxSection(daysAgo(3), now)).toBe('thisWeek');
    expect(inboxSection(daysAgo(20), now)).toBe('earlier');
    expect(inboxSection(daysAgo(100), now)).toBeNull();
  });

  it('yesterday is this week, 7 days ago is earlier', () => {
    expect(inboxSection(daysAgo(1), now)).toBe('thisWeek');
    expect(inboxSection(daysAgo(6), now)).toBe('thisWeek');
    expect(inboxSection(daysAgo(7), now)).toBe('earlier');
  });

  it('uses the Sao Paulo day: 01:00 UTC is still yesterday there', () => {
    expect(inboxSection(new Date('2026-11-15T01:00:00Z'), now)).toBe('thisWeek');
  });

  it('exactly 90 days is out, just inside is in', () => {
    expect(inboxSection(daysAgo(90), now)).toBeNull();
    expect(inboxSection(new Date(daysAgo(90).getTime() + 1000), now)).toBe('earlier');
  });

  it('a future instant counts as today', () => {
    expect(inboxSection(daysAgo(-1), now)).toBe('today');
  });
});

describe('groupBySection', () => {
  it('CA-15: fixed order, empty sections omitted, newest first', () => {
    const items = [
      { id: 'old', at: daysAgo(20) },
      { id: 'today-1', at: new Date('2026-11-15T13:00:00Z') },
      { id: 'week', at: daysAgo(3) },
      { id: 'today-2', at: new Date('2026-11-15T14:00:00Z') },
      { id: 'gone', at: daysAgo(100) },
    ];
    const groups = groupBySection(items, now);
    expect(groups.map((g) => g.section)).toEqual(['today', 'thisWeek', 'earlier']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['today-2', 'today-1']);
    expect(groups.flatMap((g) => g.items).map((i) => i.id)).not.toContain('gone');
    expect(groupBySection(items.slice(0, 1), now).map((g) => g.section)).toEqual(['earlier']);
  });
});

describe('dueReminders', () => {
  const entry = (noteId: string, at: Date) => ({ noteId, title: noteId, fireAt: at.toISOString() });

  it('CA-19: includes a reminder that already fired and excludes the future and the old one', () => {
    const due = dueReminders(
      [entry('past', daysAgo(1)), entry('future', daysAgo(-1)), entry('old', daysAgo(91))],
      now,
    );
    expect(due.map((e) => e.noteId)).toEqual(['past']);
  });

  it('a reminder firing exactly now is due', () => {
    expect(dueReminders([entry('now', now)], now)).toHaveLength(1);
  });
});

describe('preference toggles', () => {
  const all = [...unitIds];

  it('CA-18: with a home unit there are 3 toggles and others covers the 5 other units', () => {
    const toggles = prefToggles(all, 'icara');
    expect(toggles.map((t) => t.key)).toEqual(['estaca', 'home', 'others']);
    expect(toggles[2].units).toHaveLength(5);
    expect(toggles[2].units).not.toContain('icara');
    expect(toggles.every((t) => t.on)).toBe(true);
  });

  it('CA-18: turning others off leaves estaca and the home unit', () => {
    const others = prefToggles(all, 'icara')[2];
    expect(applyToggle(all, others, false)).toEqual(['estaca', 'icara']);
  });

  it('others is off when one of its units is missing', () => {
    const units = all.filter((id) => id !== 'ararangua');
    expect(prefToggles(units, 'icara')[2].on).toBe(false);
  });

  it('without a home unit there is estaca plus one toggle per unit', () => {
    const toggles = prefToggles(['estaca', 'icara'], null);
    expect(toggles).toHaveLength(7);
    expect(toggles.filter((t) => t.on).map((t) => t.key)).toEqual(['estaca', 'icara']);
  });

  it('turning a unit on keeps the order of the units', () => {
    const toggle = prefToggles(['estaca'], null).find((t) => t.key === 'criciuma2')!;
    expect(applyToggle(['icara', 'estaca'], toggle, true)).toEqual([
      'estaca',
      'criciuma2',
      'icara',
    ]);
  });
});
