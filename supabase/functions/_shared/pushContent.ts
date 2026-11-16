// Content of the push messages (spec push-notifications RF-11). Pure TypeScript with no imports so
// both Deno (the Edge Functions) and the app's tsc/Jest accept it (ADR 0006). The same rule lives in
// src/domain/notifications.ts for the in-app history; both run the same test vectors.

export type PushLocale = 'pt-BR' | 'en-US' | 'es-MX';

const SAO_PAULO_OFFSET_MINUTES = -180; // fixed UTC-3 (ADR 0005)
const MAX_BODY_LENGTH = 120;

/** "Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota"; without a place the last " · " goes too. */
export function eventPushBody(startsAt: Date, location: string, locale: PushLocale): string {
  // The UTC fields of the shifted date are the Sao Paulo wall clock.
  const wall = new Date(startsAt.getTime() + SAO_PAULO_OFFSET_MINUTES * 60_000);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(wall);
  const label = day.charAt(0).toUpperCase() + day.slice(1);
  const time = `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
  const place = location.trim();
  return place ? `${label} · ${time} · ${place}` : `${label} · ${time}`;
}

/** First non-empty line, trimmed, at most 120 characters (cut with "…" as the 120th). */
export function postPushBody(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';
  const chars = Array.from(line);
  return chars.length <= MAX_BODY_LENGTH
    ? line
    : `${chars.slice(0, MAX_BODY_LENGTH - 1).join('')}…`;
}
