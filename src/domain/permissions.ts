import type { UnitId } from './units';
import { unitIds } from './units';

export type Role = 'unit_leader' | 'unit_publisher' | 'stake_leader' | 'admin';
export type LeadershipGroup = 'stake_presidency' | 'bishops' | 'presidents';
export type Membership = { unitId: UnitId; role: Role; leadershipGroup: LeadershipGroup | null };
export type ViewerSession = { userId: string };
export type ViewerKind = 'visitor' | 'member' | 'leader';

const roles: readonly string[] = ['unit_leader', 'unit_publisher', 'stake_leader', 'admin'];
const leadershipGroups: readonly string[] = ['stake_presidency', 'bishops', 'presidents'];

export function isRole(value: string): value is Role {
  return roles.includes(value);
}

export function isLeadershipGroup(value: string): value is LeadershipGroup {
  return leadershipGroups.includes(value);
}

export function isAdmin(memberships: readonly Membership[]): boolean {
  return memberships.some((m) => m.role === 'admin');
}

export function isStakeLeader(memberships: readonly Membership[]): boolean {
  return memberships.some((m) => m.role === 'stake_leader');
}

/** 'visitor' without session; 'leader' with any unit_leader or stake_leader; otherwise 'member'. */
export function viewerKind(
  session: ViewerSession | null,
  memberships: readonly Membership[],
): ViewerKind {
  if (session === null) return 'visitor';
  return memberships.some((m) => m.role === 'unit_leader' || m.role === 'stake_leader')
    ? 'leader'
    : 'member';
}

/** Same rule as SQL can_publish (RF-06). */
export function canPublish(memberships: readonly Membership[], unitId: UnitId): boolean {
  return (
    isStakeLeader(memberships) ||
    isAdmin(memberships) ||
    memberships.some(
      (m) => m.unitId === unitId && (m.role === 'unit_leader' || m.role === 'unit_publisher'),
    )
  );
}

/** Same rule as SQL can_lead (RF-07): never true for admin or unit_publisher alone. */
export function canLead(memberships: readonly Membership[], unitId: UnitId): boolean {
  return (
    isStakeLeader(memberships) ||
    memberships.some((m) => m.unitId === unitId && m.role === 'unit_leader')
  );
}

/** Units in `unitIds` order where canPublish is true. */
export function publishableUnits(memberships: readonly Membership[]): UnitId[] {
  return unitIds.filter((id) => canPublish(memberships, id));
}

/** Units in `unitIds` order where canLead is true. */
export function leadableUnits(memberships: readonly Membership[]): UnitId[] {
  return unitIds.filter((id) => canLead(memberships, id));
}
