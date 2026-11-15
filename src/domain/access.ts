import {
  isAdmin,
  isStakeLeader,
  type LeadershipGroup,
  type Membership,
  type Role,
} from './permissions';
import { STAKE_UNIT_ID, type UnitId } from './units';

/** RF-15: who sees and uses Acessos. Mirrors the RPCs; the real barrier is the database. */
export function canManageAccess(memberships: readonly Membership[]): boolean {
  return isStakeLeader(memberships) || isAdmin(memberships);
}

/** RF-16, RF-18: roles the caller may grant in a unit (the database revalidates). */
export function grantableRoles(memberships: readonly Membership[], unitId: UnitId): Role[] {
  if (!canManageAccess(memberships)) return [];
  if (unitId === STAKE_UNIT_ID) {
    return isAdmin(memberships) ? ['stake_leader', 'admin'] : ['stake_leader'];
  }
  return ['unit_leader', 'unit_publisher'];
}

/** RF-16: leadership groups valid for a unit; `null` means no group. */
export function groupsFor(unitId: UnitId): (LeadershipGroup | null)[] {
  return unitId === STAKE_UNIT_ID ? ['stake_presidency', null] : ['bishops', 'presidents', null];
}
