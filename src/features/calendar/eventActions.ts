import { createEventInCalendarAsync } from 'expo-calendar/legacy';
import { Linking, Platform, Share } from 'react-native';

import { shareText, type CalendarEvent } from '@/domain/calendar';

/**
 * Opens the place in the system maps app (RF-13): `maps:` on iOS, `geo:` on Android, and the
 * Google Maps web search when the native scheme cannot be opened.
 * Rejects only when the web fallback fails too.
 */
export async function openInMaps(location: string): Promise<void> {
  const query = encodeURIComponent(location);
  const native = Platform.OS === 'ios' ? `maps:?q=${query}` : `geo:0,0?q=${query}`;
  try {
    await Linking.openURL(native);
  } catch {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }
}

/**
 * Opens the system "new event" dialog, pre-filled (RF-14). It is the system UI, so the app
 * never asks for calendar access (RNF-06). Resolves 'saved' only when the system says the event
 * was saved: iOS reports it; Android always answers "done" (the person may have cancelled), so it
 * gives 'other' and the caller shows no confirmation. Rejects when the dialog cannot open.
 */
export async function addToDeviceCalendar(event: CalendarEvent): Promise<'saved' | 'other'> {
  const result = await createEventInCalendarAsync({
    title: event.title,
    startDate: event.startsAt,
    endDate: event.endsAt,
    location: event.location,
    notes: [event.notes, ...event.links].filter((part) => part !== '').join('\n'),
  });
  return result.action === 'saved' ? 'saved' : 'other';
}

/** Opens the system share sheet with the text of RF-15. */
export async function shareEvent(
  event: CalendarEvent,
  labels: { date: string; unitName: string },
): Promise<void> {
  await Share.share({ message: shareText(event, labels) });
}
