export const supportedLanguages = ['pt-BR', 'en-US', 'es-MX'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];
export const defaultLanguage: SupportedLanguage = 'pt-BR';

type DeviceLocale = { languageTag: string; languageCode: string | null };

/**
 * Picks the UI language from the device locales, in the user's order of preference.
 * An exact tag wins (e.g. `es-MX`); otherwise the language code maps to our variant
 * (`es-AR` → `es-MX`, `en-GB` → `en-US`); anything else falls back to pt-BR.
 */
export function resolveLanguage(locales: readonly DeviceLocale[]): SupportedLanguage {
  for (const locale of locales) {
    const exact = supportedLanguages.find(
      (lang) => lang.toLowerCase() === locale.languageTag.toLowerCase(),
    );
    if (exact) return exact;

    const byCode = supportedLanguages.find(
      (lang) => lang.split('-')[0] === locale.languageCode?.toLowerCase(),
    );
    if (byCode) return byCode;
  }
  return defaultLanguage;
}
