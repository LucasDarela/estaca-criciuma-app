import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { isLeadershipGroup, isRole, type LeadershipGroup, type Role } from '@/domain/permissions';
import type { Locale } from '@/domain/profile';
import { isUnitId, type UnitId } from '@/domain/units';
import { signOut } from '@/lib/authSession';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

export type AccountErrorCode =
  | 'last_admin'
  | 'no_account'
  | 'already_granted'
  | 'cannot_revoke_self'
  | 'no_home_unit'
  | 'wrong_unit'
  | 'home_unit_locked'
  | 'not_authorized'
  | 'network'
  | 'unknown';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
    this.name = 'AccountError';
  }
}

const knownCodes: readonly AccountErrorCode[] = [
  'last_admin',
  'no_account',
  'already_granted',
  'cannot_revoke_self',
  'not_authorized',
  'no_home_unit',
  'wrong_unit',
  'home_unit_locked',
];

/** RPCs return a short code in `message`; a failed fetch is `network`; anything else is `unknown`. */
function toAccountError(error: unknown): AccountError {
  if (error instanceof AccountError) return error;
  if (error instanceof TypeError) return new AccountError('network');
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const known = knownCodes.find((code) => code === message);
  if (known) return new AccountError(known);
  return new AccountError(/fetch|network/i.test(message) ? 'network' : 'unknown');
}

/** Updates the caller's own profile row (policy profiles_update_own). */
export async function updateProfile(
  userId: string,
  patch: { displayName?: string; homeUnitId?: UnitId | null; locale?: Locale },
): Promise<void> {
  const update = {
    ...(patch.displayName !== undefined ? { display_name: patch.displayName.trim() } : {}),
    ...(patch.homeUnitId !== undefined ? { home_unit_id: patch.homeUnitId } : {}),
    ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
  };
  const { error } = await getSupabase().from('profiles').update(update).eq('id', userId);
  if (error) throw toAccountError(error);
}

export const EXPORT_FILE_NAME = 'meus-dados-estaca-criciuma.json';

/** RF-13: asks the database for the person's data, saves it as JSON and opens the system share. */
export async function exportMyData(): Promise<void> {
  const { data, error } = await getSupabase().rpc('export_my_data');
  if (error) throw toAccountError(error);
  const file = new File(Paths.cache, EXPORT_FILE_NAME);
  file.create({ overwrite: true });
  await file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  track('data_exported');
}

/** RF-14: deletes the account in the database, then ends the local session. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await getSupabase().rpc('delete_my_account');
  if (error) throw toAccountError(error);
  track('account_deleted');
  await signOut();
}

export type AccessEntry = {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  unitId: UnitId;
  role: Role;
  leadershipGroup: LeadershipGroup | null;
};

export const accessQueryKey = ['access'] as const;

/** RF-15. Rows with an unknown unit or role are dropped (never show or grant on unexpected data). */
export async function listAccess(): Promise<AccessEntry[]> {
  const { data, error } = await getSupabase().rpc('list_access');
  if (error) throw toAccountError(error);
  const entries: AccessEntry[] = [];
  for (const row of data ?? []) {
    if (!isUnitId(row.unit_id) || !isRole(row.role)) continue;
    entries.push({
      membershipId: row.membership_id,
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      unitId: row.unit_id,
      role: row.role,
      leadershipGroup:
        row.leadership_group && isLeadershipGroup(row.leadership_group)
          ? row.leadership_group
          : null,
    });
  }
  return entries;
}

export async function grantRole(input: {
  email: string;
  unitId: UnitId;
  role: Role;
  leadershipGroup: LeadershipGroup | null;
}): Promise<void> {
  const { data, error } = await getSupabase().rpc('grant_role', {
    p_email: input.email,
    p_unit_id: input.unitId,
    p_role: input.role,
    // The generated type is `string`, but the SQL function accepts null (no group).
    p_leadership_group: input.leadershipGroup as string,
  });
  if (error) throw toAccountError(error);
  track('role_granted', { membership_id: data });
}

export async function revokeRole(membershipId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_role', { p_membership_id: membershipId });
  if (error) throw toAccountError(error);
  track('role_revoked', { membership_id: membershipId });
}
