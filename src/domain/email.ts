export const EMAIL_MAX_LENGTH = 254;

export type EmailError = 'required' | 'invalid';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** RF-03: required, valid shape after normalizing, at most 254 characters. */
export function validateEmail(raw: string): EmailError | null {
  const email = normalizeEmail(raw);
  if (email === '') return 'required';
  if (email.length > EMAIL_MAX_LENGTH) return 'invalid';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : 'invalid';
}
