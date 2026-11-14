import type { UnitId } from './units';

export type Locale = 'pt-BR' | 'en-US' | 'es-MX';
export type Organization =
  'relief_society' | 'elders_quorum' | 'young_women' | 'young_men' | 'primary';

export type Profile = {
  id: string;
  displayName: string;
  homeUnitId: UnitId | null;
  locale: Locale;
  organizations: Organization[];
  consentedAt: string | null; // ISO timestamp
};
