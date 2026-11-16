/** Subset of the icon names in `components/icons` (domain cannot import components). */
export type EventTypeIcon = 'celebration' | 'forum' | 'school' | 'podium' | 'directions_bus';

export type EventType = 'activity' | 'meeting' | 'training' | 'conference' | 'caravan';

export const eventTypes: readonly EventType[] = [
  'activity',
  'meeting',
  'training',
  'conference',
  'caravan',
];

export const eventTypeIcon: Record<EventType, EventTypeIcon> = {
  activity: 'celebration',
  meeting: 'forum',
  training: 'school',
  conference: 'podium',
  caravan: 'directions_bus',
};

export function isEventType(value: string): value is EventType {
  return (eventTypes as readonly string[]).includes(value);
}
// Labels come from i18n: calendar.types.<type>.one / .other
