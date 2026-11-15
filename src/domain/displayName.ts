export type DisplayNameError = 'required' | 'length';

/** RF-08/RF-09: trimmed, 2 to 60 characters. */
export function validateDisplayName(raw: string): DisplayNameError | null {
  const name = raw.trim();
  if (name === '') return 'required';
  return name.length < 2 || name.length > 60 ? 'length' : null;
}
