import { isAudienceValid, toggleAudience, type AudienceKey } from './audience';
import type { CalendarEvent } from './calendar';
import type { EventType } from './eventTypes';
import { instantOf, sameDate, toSaoPauloWallTime, type CivilDate, type ClockTime } from './time';
import type { UnitId } from './units';

export const EVENT_LIMITS = { title: 80, location: 160, notes: 1000, links: 5, link: 500 } as const;

const MS_PER_HOUR = 3_600_000;

export type EventDraft = {
  title: string;
  type: EventType;
  unitId: UnitId;
  singleDay: boolean;
  startDate: CivilDate;
  startTime: ClockTime;
  /** Ignored (= startDate) while `singleDay`. */
  endDate: CivilDate;
  endTime: ClockTime;
  location: string;
  notes: string;
  links: string[];
  notify: boolean;
  audience: AudienceKey[];
};

function splitInstant(instant: Date): { date: CivilDate; time: ClockTime } {
  const { hour, minute, ...date } = toSaoPauloWallTime(instant);
  return { date, time: { hour, minute } };
}

/**
 * RF-04, RF-05, RF-06, RF-10. Start = whole hour of `now` (Sao Paulo) + 2 h, that is the next
 * whole hour + 1 h; end = start + 2 h. `singleDay` unless the end falls on the next day.
 * `units` = publishableUnits, never empty here.
 */
export function newEventDraft(now: Date, units: readonly UnitId[]): EventDraft {
  const wall = toSaoPauloWallTime(now);
  const start = instantOf({ ...wall, hour: wall.hour + 2, minute: 0 });
  const end = new Date(start.getTime() + 2 * MS_PER_HOUR);
  const s = splitInstant(start);
  const e = splitInstant(end);
  const unitId = units[0];
  return {
    title: '',
    type: 'activity',
    unitId,
    singleDay: sameDate(s.date, e.date),
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
    location: '',
    notes: '',
    links: [],
    notify: true,
    audience: toggleAudience([], 'all', unitId),
  };
}

/** Edit: the saved event; `singleDay` = same civil date for start and end; notify off. */
export function draftFromEvent(event: CalendarEvent): EventDraft {
  const s = splitInstant(event.startsAt);
  const e = splitInstant(event.endsAt);
  return {
    title: event.title,
    type: event.type,
    unitId: event.unitId,
    singleDay: sameDate(s.date, e.date),
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
    location: event.location,
    notes: event.notes,
    links: [...event.links],
    notify: false,
    audience: [],
  };
}

export type DraftField = 'title' | 'end' | 'location' | 'notes' | 'audience';
export type DraftError = 'required' | 'tooLong' | 'endBeforeStart' | 'emptyAudience';
export type DraftErrors = Partial<Record<DraftField, DraftError>>;

/** The instants of the draft; `endDate` = `startDate` when `singleDay`. */
export function draftInstants(draft: EventDraft): { startsAt: Date; endsAt: Date } {
  const endDate = draft.singleDay ? draft.startDate : draft.endDate;
  return {
    startsAt: instantOf({ ...draft.startDate, ...draft.startTime }),
    endsAt: instantOf({ ...endDate, ...draft.endTime }),
  };
}

/**
 * RF-03, RF-04, RF-07, RF-08, RF-10. The keys follow the order of the fields on the screen, so
 * the first key is the first invalid field (RNF-10).
 */
export function validateDraft(draft: EventDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (title === '') errors.title = 'required';
  else if (title.length > EVENT_LIMITS.title) errors.title = 'tooLong';

  const { startsAt, endsAt } = draftInstants(draft);
  if (endsAt.getTime() <= startsAt.getTime()) errors.end = 'endBeforeStart';

  if (draft.location.trim().length > EVENT_LIMITS.location) errors.location = 'tooLong';
  if (draft.notes.length > EVENT_LIMITS.notes) errors.notes = 'tooLong';
  if (draft.notify && !isAudienceValid(draft.audience, draft.unitId)) {
    errors.audience = 'emptyAudience';
  }
  return errors;
}

/** RF-09. The text of the link field before adding it. `null` = ok (500 is the field's maxLength). */
export function validateLink(
  text: string,
  current: readonly string[],
): 'notHttps' | 'tooMany' | null {
  if (current.length >= EVENT_LIMITS.links) return 'tooMany';
  if (!text.trim().startsWith('https://')) return 'notHttps';
  return null;
}

export type EventInput = {
  unitId: UnitId;
  type: EventType;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  notes: string;
  links: string[];
};

/** Title and location trimmed; notes as typed. */
export function toEventInput(draft: EventDraft): EventInput {
  return {
    unitId: draft.unitId,
    type: draft.type,
    title: draft.title.trim(),
    ...draftInstants(draft),
    location: draft.location.trim(),
    notes: draft.notes,
    links: [...draft.links],
  };
}

function fingerprint(draft: EventDraft): string {
  const input = toEventInput(draft);
  return JSON.stringify({
    ...input,
    startsAt: input.startsAt.getTime(),
    endsAt: input.endsAt.getTime(),
    notify: draft.notify,
    audience: draft.audience,
  });
}

/** RF-13. Compares the fields that are saved plus `notify` and `audience`. */
export function isDraftDirty(initial: EventDraft, current: EventDraft): boolean {
  return fingerprint(initial) !== fingerprint(current);
}
