import type { Membership } from './permissions';
import type { Locale } from './profile';
import { unitKind, type UnitId } from './units';

export type CallingLevel = 'stake' | 'ward' | 'branch' | 'ward_branch';
export type CallingAccess =
  'none' | 'unit_publisher' | 'unit_leader' | 'stake_publisher' | 'stake_leader';
export type NotifyGroup =
  | 'stake_presidency'
  | 'high_council'
  | 'bishoprics'
  | 'elders_quorum_presidency'
  | 'relief_society_presidency'
  | 'young_women_presidency'
  | 'primary_presidency'
  | 'sunday_school_presidency'
  | 'clerks'
  | 'missionaries'
  | 'temple_family_history_workers'
  | 'music'
  | 'young_single_adult_leaders';
export type OrgChartSection =
  | 'stake_presidency'
  | 'high_council'
  | 'stake_clerks'
  | 'stake_organizations'
  | 'bishopric'
  | 'unit_clerks'
  | 'unit_organizations';
export type OrgChartConsent = 'pending' | 'accepted' | 'declined';

export type Calling = {
  id: string;
  namePt: string;
  nameEn: string | null;
  nameEs: string | null;
  level: CallingLevel;
  access: CallingAccess;
  notifyGroup: NotifyGroup | null;
  orgChartSection: OrgChartSection | null;
  sortOrder: number;
  active: boolean;
};

/** A calling held by a person in a unit. `orgChartConsent` is null when it has no section. */
export type MemberCall = {
  id: string;
  unitId: UnitId;
  calling: Calling;
  orgChartConsent: OrgChartConsent | null;
};

export const callingLevels: readonly CallingLevel[] = ['stake', 'ward', 'branch', 'ward_branch'];

/** RF-04 order. */
export const notifyGroups: readonly NotifyGroup[] = [
  'stake_presidency',
  'high_council',
  'bishoprics',
  'elders_quorum_presidency',
  'relief_society_presidency',
  'young_women_presidency',
  'primary_presidency',
  'sunday_school_presidency',
  'clerks',
  'missionaries',
  'temple_family_history_workers',
  'music',
  'young_single_adult_leaders',
];

const stakeSections: readonly OrgChartSection[] = [
  'stake_presidency',
  'high_council',
  'stake_clerks',
  'stake_organizations',
];
const unitSections: readonly OrgChartSection[] = ['bishopric', 'unit_clerks', 'unit_organizations'];
const stakeAccesses: readonly CallingAccess[] = ['none', 'stake_publisher', 'stake_leader'];
const unitAccesses: readonly CallingAccess[] = ['none', 'unit_publisher', 'unit_leader'];
const consents: readonly string[] = ['pending', 'accepted', 'declined'];

export function isCallingLevel(value: string): value is CallingLevel {
  return (callingLevels as readonly string[]).includes(value);
}

export function isCallingAccess(value: string): value is CallingAccess {
  return [...stakeAccesses, ...unitAccesses].includes(value as CallingAccess);
}

export function isNotifyGroup(value: string): value is NotifyGroup {
  return (notifyGroups as readonly string[]).includes(value);
}

export function isOrgChartSection(value: string): value is OrgChartSection {
  return [...stakeSections, ...unitSections].includes(value as OrgChartSection);
}

export function isOrgChartConsent(value: string): value is OrgChartConsent {
  return consents.includes(value);
}

/** RF-03: the name in the interface language; without a translation, the pt-BR name. */
export function callingName(
  calling: Pick<Calling, 'namePt' | 'nameEn' | 'nameEs'>,
  locale: Locale,
): string {
  if (locale === 'en-US') return calling.nameEn ?? calling.namePt;
  if (locale === 'es-MX') return calling.nameEs ?? calling.namePt;
  return calling.namePt;
}

/** RF-10: whether a calling of this level can be held in the unit (by the unit kind). */
export function levelFitsUnit(level: CallingLevel, unitId: UnitId): boolean {
  const kind = unitKind(unitId);
  if (level === 'stake') return kind === 'stake';
  if (level === 'ward_branch') return kind === 'ward' || kind === 'branch';
  return level === kind;
}

/** RF-13: active callings that fit the unit, by `sortOrder`. */
export function callingsForUnit(catalog: readonly Calling[], unitId: UnitId): Calling[] {
  return catalog
    .filter((c) => c.active && levelFitsUnit(c.level, unitId))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** RF-21: the access values that are valid for a level. */
export function accessesForLevel(level: CallingLevel): CallingAccess[] {
  return [...(level === 'stake' ? stakeAccesses : unitAccesses)];
}

/** RF-05: the org chart sections that are valid for a level. */
export function sectionsForLevel(level: CallingLevel): OrgChartSection[] {
  return [...(level === 'stake' ? stakeSections : unitSections)];
}

/** Trim, lowercase and drop diacritics, so "Primária" and "primaria" are the same term. */
export function normalizeSearch(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

const minSearchLength = 2;

/**
 * RF-20: whether any of the 3 names contains the term. A term shorter than 2 characters does not
 * filter anything (every calling matches).
 */
export function matchesCalling(calling: Calling, term: string): boolean {
  const needle = normalizeSearch(term);
  if (needle.length < minSearchLength) return true;
  return [calling.namePt, calling.nameEn, calling.nameEs].some(
    (name) => name !== null && normalizeSearch(name).includes(needle),
  );
}

/** RF-09: the access of each active calling (the ones with access `none` grant nothing). */
export function membershipsFromCalls(calls: readonly MemberCall[]): Membership[] {
  const memberships: Membership[] = [];
  for (const call of calls) {
    const { access, active } = call.calling;
    if (!active || access === 'none') continue;
    memberships.push({ unitId: call.unitId, role: access });
  }
  return memberships;
}

/** A `calling_catalog` row as the API returns it (snake_case, untrusted strings). */
export type CallingRow = {
  id: string;
  name_pt: string;
  name_en: string | null;
  name_es: string | null;
  level: string;
  access: string;
  notify_group: string | null;
  org_chart_section: string | null;
  sort_order: number;
  active: boolean;
};

/** Maps an API row to a `Calling`. A row with an unknown level, access, group or section is dropped. */
export function callingFromRow(row: CallingRow): Calling | null {
  if (!isCallingLevel(row.level) || !isCallingAccess(row.access)) return null;
  if (row.notify_group !== null && !isNotifyGroup(row.notify_group)) return null;
  if (row.org_chart_section !== null && !isOrgChartSection(row.org_chart_section)) return null;
  return {
    id: row.id,
    namePt: row.name_pt,
    nameEn: row.name_en,
    nameEs: row.name_es,
    level: row.level,
    access: row.access,
    notifyGroup: row.notify_group,
    orgChartSection: row.org_chart_section,
    sortOrder: row.sort_order,
    active: row.active,
  };
}
