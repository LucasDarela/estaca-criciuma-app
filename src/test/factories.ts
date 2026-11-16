import type { CalendarEvent } from '@/domain/calendar';

let sequence = 0;

/** A calendar event with sensible defaults; override what the test cares about. */
export function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  sequence += 1;
  return {
    id: `event-${sequence}`,
    unitId: 'estaca',
    type: 'activity',
    title: `Evento ${sequence}`,
    startsAt: new Date('2026-11-13T22:00:00Z'), // 19:00 in Sao Paulo
    endsAt: new Date('2026-11-14T00:00:00Z'), // 21:00 in Sao Paulo
    location: '',
    notes: '',
    links: [],
    ...overrides,
  };
}
