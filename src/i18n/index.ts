import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from './locales/en-US.json';
import esMX from './locales/es-MX.json';
import ptBR from './locales/pt-BR.json';
import { defaultLanguage, resolveLanguage } from './resolveLanguage';

export const resources = {
  'pt-BR': { translation: ptBR },
  'en-US': { translation: enUS },
  'es-MX': { translation: esMX },
} as const;

// Own instance instead of the global default, so tests and the app share one explicit setup.
const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getLocales()),
  fallbackLng: defaultLanguage,
  // Resources are bundled, so initialization can be synchronous (no flash of keys).
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
