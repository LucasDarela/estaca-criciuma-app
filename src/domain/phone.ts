/** Brazilian phone numbers. `digits` is the national number without +55 (area code + number). */

const E164_PREFIX = '+55';
const MAX_DIGITS = 11;

/** Keeps only the digits, at most 11 (area code + 9-digit mobile). */
export function phoneDigits(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, MAX_DIGITS);
}

/** Progressive mask: '4' -> '(4', '4899' -> '(48) 99', 10 digits -> '(48) 3333-0000', 11 -> '(48) 99999-0000'. */
export function maskPhone(digits: string): string {
  const d = phoneDigits(digits);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const area = d.slice(0, 2);
  const rest = d.slice(2);
  const split = d.length === MAX_DIGITS ? 5 : 4;
  if (rest.length <= split) return `(${area}) ${rest}`;
  return `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Area code 11 to 99 (no leading 0) and 8 or 9 digits after it. */
export function isValidPhoneDigits(digits: string): boolean {
  return /^[1-9][0-9][0-9]{8,9}$/.test(digits);
}

export function toE164(digits: string): string {
  return `${E164_PREFIX}${digits}`;
}

export function digitsFromE164(e164: string): string {
  return e164.startsWith(E164_PREFIX) ? e164.slice(E164_PREFIX.length) : e164;
}

export function formatPhone(e164: string): string {
  return maskPhone(digitsFromE164(e164));
}

/** Spoken digit by digit, in the same groups as the mask: '4 8, 9 9 9 9 9, 0 0 0 0'. */
export function phoneSpeech(e164: string): string {
  const d = digitsFromE164(e164);
  const split = d.length === MAX_DIGITS ? 7 : 6;
  const spaced = (part: string) => part.split('').join(' ');
  return [spaced(d.slice(0, 2)), spaced(d.slice(2, split)), spaced(d.slice(split))]
    .filter((part) => part !== '')
    .join(', ');
}

export function telUrl(e164: string): string {
  return `tel:${e164}`;
}

/** WhatsApp only for mobile numbers (11 digits). */
export function whatsappUrl(e164: string): string | null {
  return digitsFromE164(e164).length === MAX_DIGITS
    ? `https://wa.me/${e164.replace('+', '')}`
    : null;
}
