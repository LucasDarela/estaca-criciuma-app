import { isAdmin, isStakeLeader, type Membership } from './permissions';

/** RF-12: who sees and uses Acessos. Mirrors the RPCs; the real barrier is the database. */
export function canManageAccess(memberships: readonly Membership[]): boolean {
  return isStakeLeader(memberships) || isAdmin(memberships);
}
