/**
 * Avatar initials: first letter of the first and of the last name, uppercase.
 * A single name gives one letter; blank input gives an empty string.
 * Letters are taken by code point so accented letters stay whole ("Ângela" -> "Â").
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toLocaleUpperCase('pt-BR');
}
