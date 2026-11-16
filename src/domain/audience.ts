import { notifyGroups, type CallingAccess, type NotifyGroup } from './callings';
import { organizations, type Organization } from './profile';
import { STAKE_UNIT_ID, unitKind, type UnitId, type UnitKind } from './units';

/** RF-09. `all` is the "everyone" chip; the rest are leadership groups and organizations. */
export type AudienceKey = 'all' | 'leaders' | NotifyGroup | Organization;

/** Groups that only make sense for a stake item (RF-09, roles-of-leadership). */
const stakeOnlyGroups: readonly NotifyGroup[] = ['stake_presidency', 'high_council'];

/** Same list and order as `push_audience_options` in the database. */
export function audienceOptions(unitId: UnitId): AudienceKey[] {
  const groups =
    unitId === STAKE_UNIT_ID
      ? notifyGroups
      : notifyGroups.filter((g) => !stakeOnlyGroups.includes(g));
  return ['all', ...groups, 'leaders', ...organizations];
}

/**
 * RF-13. Tapping `all` selects every option, or clears them when `all` was already selected.
 * Tapping another toggles only it and drops `all`; when every other option ends up selected,
 * `all` joins them. The result follows the order of the options.
 */
export function toggleAudience(
  selected: readonly AudienceKey[],
  key: AudienceKey,
  unitId: UnitId,
): AudienceKey[] {
  const options = audienceOptions(unitId);
  if (key === 'all') return selected.includes('all') ? [] : options;

  const next = new Set<AudienceKey>(selected.filter((k) => k !== 'all'));
  if (next.has(key)) next.delete(key);
  else next.add(key);
  const others = options.filter((k) => k !== 'all');
  if (others.every((k) => next.has(k))) next.add('all');
  return options.filter((k) => next.has(k));
}

/** The selection is not empty and every key is an option of the unit. */
export function isAudienceValid(selected: readonly AudienceKey[], unitId: UnitId): boolean {
  const options = audienceOptions(unitId);
  return selected.length > 0 && selected.every((k) => options.includes(k));
}

export type AudienceSummary =
  | { kind: 'empty' }
  | { kind: 'everyone'; unitKind: UnitKind }
  | { kind: 'groups'; keys: AudienceKey[] };

export function audienceSummary(selected: readonly AudienceKey[], unitId: UnitId): AudienceSummary {
  if (selected.length === 0) return { kind: 'empty' };
  if (selected.includes('all')) return { kind: 'everyone', unitKind: unitKind(unitId) };
  return { kind: 'groups', keys: audienceOptions(unitId).filter((k) => selected.includes(k)) };
}

export type RecipientDevice = {
  units: UnitId[];
  signedIn: boolean;
  organizations: Organization[];
  calls: { unitId: UnitId; notifyGroup: NotifyGroup | null; access: CallingAccess }[];
};

/**
 * RF-10. Mirror of `push_recipients` in the database, kept for the rule tests (the database is
 * the real rule). A device without an account only receives `all`.
 */
export function isRecipient(
  device: RecipientDevice,
  unitId: UnitId,
  audience: readonly AudienceKey[],
): boolean {
  if (!device.units.includes(unitId)) return false;
  if (audience.includes('all')) return true;
  if (!device.signedIn) return false;

  const inScope = (callUnit: UnitId) => unitId === STAKE_UNIT_ID || callUnit === unitId;
  return (
    device.organizations.some((o) => audience.includes(o)) ||
    device.calls.some(
      (c) => c.notifyGroup !== null && audience.includes(c.notifyGroup) && inScope(c.unitId),
    ) ||
    (audience.includes('leaders') &&
      device.calls.some((c) => c.access !== 'none' && inScope(c.unitId)))
  );
}
