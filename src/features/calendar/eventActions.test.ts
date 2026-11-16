import { createEventInCalendarAsync } from 'expo-calendar/legacy';
import { Linking, Platform, Share } from 'react-native';

import { makeEvent } from '@/test/factories';

import { addToDeviceCalendar, openInMaps, shareEvent } from './eventActions';

jest.mock('expo-calendar/legacy', () => ({ createEventInCalendarAsync: jest.fn() }));

const event = makeEvent({
  title: 'Conferência de Estaca',
  startsAt: new Date('2026-11-15T12:00:00Z'),
  endsAt: new Date('2026-11-15T15:00:00Z'),
  location: 'Centro de Estaca, Criciúma',
  notes: 'Chegue cedo.',
  links: ['https://example.org/a', 'https://example.org/b'],
});

afterEach(() => jest.restoreAllMocks());

describe('openInMaps', () => {
  it('CA-14: opens maps:?q= on iOS with the encoded place', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    await openInMaps('Centro de Estaca, Criciúma');

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('maps:?q=Centro%20de%20Estaca%2C%20Crici%C3%BAma');
  });

  it('CA-14: opens geo:0,0?q= on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    await openInMaps('Capela');

    expect(open).toHaveBeenCalledWith('geo:0,0?q=Capela');
  });

  it('CA-14: falls back to Google Maps on the web when the native scheme fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no handler'))
      .mockResolvedValueOnce();

    await openInMaps('Capela');

    expect(open).toHaveBeenLastCalledWith('https://www.google.com/maps/search/?api=1&query=Capela');
  });

  it('rejects when the fallback fails too', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));

    await expect(openInMaps('Capela')).rejects.toThrow('no browser');
  });
});

describe('addToDeviceCalendar', () => {
  it('CA-15: opens the system dialog with the event data, notes followed by the links', async () => {
    (createEventInCalendarAsync as jest.Mock).mockResolvedValue({ action: 'saved', id: '1' });

    const result = await addToDeviceCalendar(event);

    expect(result).toBe('saved');
    expect(createEventInCalendarAsync).toHaveBeenCalledWith({
      title: 'Conferência de Estaca',
      startDate: event.startsAt,
      endDate: event.endsAt,
      location: 'Centro de Estaca, Criciúma',
      notes: 'Chegue cedo.\nhttps://example.org/a\nhttps://example.org/b',
    });
  });

  it('CA-15: leaves the notes empty when there are neither notes nor links', async () => {
    (createEventInCalendarAsync as jest.Mock).mockResolvedValue({ action: 'canceled', id: null });

    await addToDeviceCalendar({ ...event, notes: '', links: [] });

    expect(createEventInCalendarAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ notes: '' }),
    );
  });

  it.each(['canceled', 'deleted', 'done'])('reports "other" for the %s action', async (action) => {
    (createEventInCalendarAsync as jest.Mock).mockResolvedValue({ action, id: null });

    await expect(addToDeviceCalendar(event)).resolves.toBe('other');
  });

  it('rejects when the dialog cannot open', async () => {
    (createEventInCalendarAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));

    await expect(addToDeviceCalendar(event)).rejects.toThrow('unavailable');
  });
});

describe('shareEvent', () => {
  it('CA-16: shares the text of RF-15', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });

    await shareEvent(event, { date: 'Domingo, 15 de novembro de 2026', unitName: 'Estaca' });

    expect(share).toHaveBeenCalledWith({
      message: [
        'Conferência de Estaca',
        'Domingo, 15 de novembro de 2026 · 09:00–12:00',
        'Centro de Estaca, Criciúma',
        'Estaca',
        'https://example.org/a',
        'https://example.org/b',
      ].join('\n'),
    });
  });
});
