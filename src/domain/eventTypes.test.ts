import { eventTypeIcon, eventTypes, isEventType } from './eventTypes';

describe('eventTypes', () => {
  it('lists the five types of RF-02', () => {
    expect(eventTypes).toEqual(['activity', 'meeting', 'training', 'conference', 'caravan']);
  });

  it('maps each type to its icon', () => {
    expect(eventTypeIcon).toEqual({
      activity: 'celebration',
      meeting: 'forum',
      training: 'school',
      conference: 'podium',
      caravan: 'directions_bus',
    });
  });

  it('isEventType accepts known types only', () => {
    expect(isEventType('meeting')).toBe(true);
    expect(isEventType('party')).toBe(false);
  });
});
