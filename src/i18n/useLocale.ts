import { useTranslation } from 'react-i18next';

import type { Locale } from '@/domain/profile';

import { defaultLanguage, supportedLanguages } from './resolveLanguage';

/** The interface language as a `Locale` (for names that come from the database in 3 languages). */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  const language = (supportedLanguages as readonly string[]).includes(i18n.language)
    ? i18n.language
    : defaultLanguage;
  return language as Locale;
}
