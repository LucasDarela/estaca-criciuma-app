import type { CalendarEvent } from './calendar';
import {
  draftFromEvent,
  isDraftDirty,
  newEventDraft,
  toEventInput,
  validateDraft,
  validateLink,
  type EventDraft,
} from './eventForm';
import { toggleAudience } from './audience';

// Sao Paulo is UTC-3, so 18:20 there is 21:20Z.
const at = (iso: string) => new Date(`${iso}-03:00`);

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    ...newEventDraft(at('2026-11-13T10:00:00'), ['icara']),
    title: 'Noite cultural',
    ...overrides,
  };
}

describe('newEventDraft', () => {
  it('RF-04: 18:20 starts at 20:00 and ends at 22:00 the same day', () => {
    const d = newEventDraft(at('2026-11-13T18:20:00'), ['icara']);
    expect(d.startTime).toEqual({ hour: 20, minute: 0 });
    expect(d.endTime).toEqual({ hour: 22, minute: 0 });
    expect(d.startDate).toEqual({ year: 2026, month: 11, day: 13 });
    expect(d.singleDay).toBe(true);
  });

  it('RF-04: 18:00 sharp starts at 20:00', () => {
    expect(newEventDraft(at('2026-11-13T18:00:00'), ['icara']).startTime).toEqual({
      hour: 20,
      minute: 0,
    });
  });

  it('RF-04: 22:10 starts at 00:00 of the next day, still single day', () => {
    const d = newEventDraft(at('2026-11-13T22:10:00'), ['icara']);
    expect(d.startDate).toEqual({ year: 2026, month: 11, day: 14 });
    expect(d.startTime).toEqual({ hour: 0, minute: 0 });
    expect(d.endTime).toEqual({ hour: 2, minute: 0 });
    expect(d.singleDay).toBe(true);
  });

  it('RF-04: 21:30 ends the next day, so it is not single day', () => {
    const d = newEventDraft(at('2026-11-13T21:30:00'), ['icara']);
    expect(d.startTime).toEqual({ hour: 23, minute: 0 });
    expect(d.endTime).toEqual({ hour: 1, minute: 0 });
    expect(d.endDate).toEqual({ year: 2026, month: 11, day: 14 });
    expect(d.singleDay).toBe(false);
  });

  it('RF-05, RF-06, RF-10: first unit, activity, notify on, every audience option', () => {
    const d = newEventDraft(at('2026-11-13T10:00:00'), ['criciuma1', 'icara']);
    expect(d.unitId).toBe('criciuma1');
    expect(d.type).toBe('activity');
    expect(d.notify).toBe(true);
    expect(d.audience).toEqual(toggleAudience([], 'all', 'criciuma1'));
    expect(d.audience[0]).toBe('all');
  });
});

describe('validateDraft', () => {
  it('RF-03: an empty or blank name is required', () => {
    expect(validateDraft(draft({ title: '' })).title).toBe('required');
    expect(validateDraft(draft({ title: '   ' })).title).toBe('required');
  });

  it('RF-03: 81 characters are too long, 80 are fine', () => {
    expect(validateDraft(draft({ title: 'a'.repeat(81) })).title).toBe('tooLong');
    expect(validateDraft(draft({ title: 'a'.repeat(80) })).title).toBeUndefined();
  });

  it('CA-04: an end before the start is rejected', () => {
    const d = draft({ startTime: { hour: 19, minute: 30 }, endTime: { hour: 19, minute: 0 } });
    expect(validateDraft(d).end).toBe('endBeforeStart');
  });

  it('CA-05: an end on another day is valid when not single day', () => {
    const d = draft({
      singleDay: false,
      startTime: { hour: 19, minute: 30 },
      endDate: { year: 2026, month: 11, day: 15 },
      endTime: { hour: 10, minute: 0 },
    });
    expect(validateDraft(d).end).toBeUndefined();
  });

  it('RF-04: single day ignores a stale endDate', () => {
    const d = draft({
      singleDay: true,
      startTime: { hour: 19, minute: 30 },
      endDate: { year: 2030, month: 1, day: 1 },
      endTime: { hour: 21, minute: 0 },
    });
    expect(validateDraft(d).end).toBeUndefined();
  });

  it('CA-23: a 160-character location is valid, 161 is not', () => {
    expect(validateDraft(draft({ location: 'a'.repeat(160) })).location).toBeUndefined();
    expect(validateDraft(draft({ location: 'a'.repeat(161) })).location).toBe('tooLong');
  });

  it('CA-23: 1001 characters of notes are too long, 1000 are fine', () => {
    expect(validateDraft(draft({ notes: 'a'.repeat(1001) })).notes).toBe('tooLong');
    expect(validateDraft(draft({ notes: 'a'.repeat(1000) })).notes).toBeUndefined();
  });

  it('CA-08: notify with no audience is rejected', () => {
    expect(validateDraft(draft({ notify: true, audience: [] })).audience).toBe('emptyAudience');
    expect(validateDraft(draft({ notify: false, audience: [] })).audience).toBeUndefined();
  });

  it('RNF-10: the keys follow the order of the fields on the screen', () => {
    const errors = validateDraft(
      draft({
        title: '',
        endTime: { hour: 0, minute: 0 },
        location: 'a'.repeat(161),
        notes: 'a'.repeat(1001),
        notify: true,
        audience: [],
      }),
    );
    expect(Object.keys(errors)).toEqual(['title', 'end', 'location', 'notes', 'audience']);
  });

  it('a valid draft has no errors', () => {
    expect(validateDraft(draft())).toEqual({});
  });
});

describe('validateLink', () => {
  it('CA-07: http:// is rejected', () => {
    expect(validateLink('http://x.org', [])).toBe('notHttps');
  });

  it('RF-09: https:// is accepted and the text is trimmed', () => {
    expect(validateLink('  https://x.org ', [])).toBeNull();
  });

  it('RF-09: a sixth link is rejected', () => {
    const five = Array.from({ length: 5 }, (_, i) => `https://x.org/${i}`);
    expect(validateLink('https://x.org/6', five)).toBe('tooMany');
  });
});

describe('draft conversions', () => {
  const event: CalendarEvent = {
    id: 'e1',
    unitId: 'icara',
    type: 'training',
    title: 'Treinamento',
    startsAt: new Date('2026-11-13T22:30:00Z'),
    endsAt: new Date('2026-11-14T13:00:00Z'),
    location: 'Capela',
    notes: 'n',
    links: ['https://a.org'],
  };

  it('RF-04: a two-day event is not single day', () => {
    const d = draftFromEvent(event);
    expect(d.singleDay).toBe(false);
    expect(d.startTime).toEqual({ hour: 19, minute: 30 });
    expect(d.endDate).toEqual({ year: 2026, month: 11, day: 14 });
    expect(d.notify).toBe(false);
    expect(d.audience).toEqual([]);
  });

  it('CA-20: toEventInput gives the 22:30Z instant for 19:30 in Sao Paulo', () => {
    expect(toEventInput(draftFromEvent(event)).startsAt.toISOString()).toBe(
      '2026-11-13T22:30:00.000Z',
    );
  });

  it('toEventInput trims title and location, notes stay as typed', () => {
    const input = toEventInput(draft({ title: '  A  ', location: ' L ', notes: ' n ' }));
    expect(input.title).toBe('A');
    expect(input.location).toBe('L');
    expect(input.notes).toBe(' n ');
  });
});

describe('isDraftDirty', () => {
  it('RF-13: the same draft is not dirty, a new name is', () => {
    const initial = draft();
    expect(isDraftDirty(initial, { ...initial })).toBe(false);
    expect(isDraftDirty(initial, { ...initial, title: 'Outro' })).toBe(true);
  });

  it('RF-13: notify and audience count as changes', () => {
    const initial = draft();
    expect(isDraftDirty(initial, { ...initial, notify: false })).toBe(true);
    expect(isDraftDirty(initial, { ...initial, audience: [] })).toBe(true);
  });

  it('RF-13: whitespace around the name is not a change', () => {
    const initial = draft({ title: 'A' });
    expect(isDraftDirty(initial, { ...initial, title: ' A ' })).toBe(false);
  });
});
