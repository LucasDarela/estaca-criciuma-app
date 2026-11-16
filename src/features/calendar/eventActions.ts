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
 * never asks for calendar access (RNF-06). Resolves 'saved' when the caller should confirm (CA-15):
 * iOS reports 'saved' only when the event was saved; Android always answers 'done' and cannot tell
 * a save from a cancel, so 'done' counts as saved there (product decision, assessment round 1).
 * On Android the activity runs in the app's task, so the promise resolves when the person comes
 * back from the calendar, not as soon as it opens. Rejects when the dialog cannot open.
 */
export async function addToDeviceCalendar(event: CalendarEvent): Promise<'saved' | 'other'> {
  const result = await createEventInCalendarAsync(
    {
      title: event.title,
      startDate: event.startsAt,
      endDate: event.endsAt,
      location: event.location,
      notes: [event.notes, ...event.links].filter((part) => part !== '').join('\n'),
    },
    { startNewActivityTask: false },
  );
  if (result.action === 'saved') return 'saved';
  if (Platform.OS === 'android' && result.action === 'done') return 'saved';
  return 'other';
}

/** Opens the system share sheet with the text of RF-15. */
export async function shareEvent(
  event: CalendarEvent,
  labels: { date: string; unitName: string },
): Promise<void> {
  await Share.share({ message: shareText(event, labels) });
}
