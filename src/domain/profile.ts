import type { UnitId } from './units';

export type Locale = 'pt-BR' | 'en-US' | 'es-MX';
export type Organization =
  | 'relief_society'
  | 'elders_quorum'
  | 'young_women'
  | 'young_men'
  | 'primary'
  | 'temple_family_history';

/** RF-09 order. Same values as the `profiles.organizations` check constraint. */
export const organizations: readonly Organization[] = [
  'relief_society',
  'elders_quorum',
  'young_women',
  'young_men',
  'primary',
  'temple_family_history',
];

export type Profile = {
  id: string;
  displayName: string;
  homeUnitId: UnitId | null;
  locale: Locale;
  organizations: Organization[];
  consentedAt: string | null; // ISO timestamp
};
