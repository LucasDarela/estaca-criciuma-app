import type { ReminderEntry } from '@/domain/notifications';

import { secureSessionStorage } from './secureSessionStorage';

/**
 * Local log of reminders that already fired for the person's notes. The `notes` spec writes it;
 * the notifications history reads it (RF-20). Encrypted like the session: a note title is sensitive.
 */
const STORAGE_KEY = 'reminderLog.v1';

function isEntry(value: unknown): value is ReminderEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.noteId === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.fireAt === 'string' &&
    !Number.isNaN(new Date(entry.fireAt).getTime())
  );
}

/** Invalid or unreadable content is an empty log. */
export async function readReminderLog(): Promise<ReminderEntry[]> {
  try {
    const raw = await secureSessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

async function write(entries: ReminderEntry[]): Promise<void> {
  await secureSessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Adds the entry; the same note and fire time is kept once. */
export async function addReminder(entry: ReminderEntry): Promise<void> {
  const entries = await readReminderLog();
  const exists = entries.some((e) => e.noteId === entry.noteId && e.fireAt === entry.fireAt);
  if (!exists) await write([...entries, entry]);
}

/** Removes every entry of the note (the note was deleted). */
export async function removeReminders(noteId: string): Promise<void> {
  const entries = await readReminderLog();
  const kept = entries.filter((e) => e.noteId !== noteId);
  if (kept.length !== entries.length) await write(kept);
}
