import {
  countByKind,
  isMeetingItemKind,
  itemsOfKind,
  shortDate,
  type MeetingItem,
} from './meetingItems';

const item = (id: string, kind: MeetingItem['kind']): MeetingItem => ({
  id,
  kind,
  text: id,
  carriedFromDate: null,
});

describe('meetingItems', () => {
  const items = [
    item('a', 'agenda'),
    item('b', 'pending'),
    item('c', 'agenda'),
    item('d', 'decision'),
  ];

  it('RF-17: counts the items by kind', () => {
    expect(countByKind(items)).toEqual({ agenda: 2, decision: 1, pending: 1 });
    expect(countByKind([])).toEqual({ agenda: 0, decision: 0, pending: 0 });
  });

  it('RF-19: keeps the given order inside a kind', () => {
    expect(itemsOfKind(items, 'agenda').map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('RF-19: formats the carried date as dd/mm', () => {
    expect(shortDate({ year: 2026, month: 10, day: 15 })).toBe('15/10');
    expect(shortDate({ year: 2026, month: 1, day: 5 })).toBe('05/01');
  });

  it('recognizes only known kinds', () => {
    expect(isMeetingItemKind('decision')).toBe(true);
    expect(isMeetingItemKind('other')).toBe(false);
  });
});
