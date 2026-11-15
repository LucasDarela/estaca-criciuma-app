import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { callingFromRow, type Calling } from '@/domain/callings';
import { normalizeEmail } from '@/domain/email';
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
  | 'invalid_calling'
  | 'invalid_unit_for_calling'
  | 'name_taken'
  | 'level_locked'
  | 'in_use'
  | 'invalid_access'
  | 'invalid_section'
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
  'invalid_calling',
  'invalid_unit_for_calling',
  'name_taken',
  'level_locked',
  'in_use',
  'invalid_access',
  'invalid_section',
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
  /** `member_calls.id` for a calling, `memberships.id` for the admin. */
  entryId: string;
  kind: 'calling' | 'admin';
  userId: string;
  displayName: string;
  email: string;
  unitId: UnitId;
  /** Null for the admin ("Administração"). */
  calling: Pick<Calling, 'id' | 'namePt' | 'nameEn' | 'nameEs'> | null;
};

export const accessQueryKey = ['access'] as const;

/** RF-12. Rows with an unknown unit or kind are dropped (never show or grant on unexpected data). */
export async function listAccess(): Promise<AccessEntry[]> {
  const { data, error } = await getSupabase().rpc('list_access');
  if (error) throw toAccountError(error);
  const entries: AccessEntry[] = [];
  for (const row of data ?? []) {
    if (!isUnitId(row.unit_id)) continue;
    const base = {
      entryId: row.entry_id,
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      unitId: row.unit_id,
    };
    if (row.kind === 'admin') {
      entries.push({ ...base, kind: 'admin', calling: null });
    } else if (row.kind === 'calling' && row.calling_id && row.calling_name_pt) {
      entries.push({
        ...base,
        kind: 'calling',
        calling: {
          id: row.calling_id,
          namePt: row.calling_name_pt,
          nameEn: row.calling_name_en,
          nameEs: row.calling_name_es,
        },
      });
    }
  }
  return entries;
}

/** RF-13. The e-mail is normalized here; the database revalidates every rule. */
export async function grantCalling(input: {
  email: string;
  unitId: UnitId;
  callingId: string;
}): Promise<void> {
  const { data, error } = await getSupabase().rpc('grant_calling', {
    p_email: normalizeEmail(input.email),
    p_unit_id: input.unitId,
    p_calling_id: input.callingId,
  });
  if (error) throw toAccountError(error);
  track('calling_granted', { membership_id: data, calling_id: input.callingId });
}

/** RF-14. */
export async function revokeCalling(memberCallId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_calling', { p_member_call_id: memberCallId });
  if (error) throw toAccountError(error);
  track('calling_revoked', { membership_id: memberCallId });
}

/** RF-15: only the admin can give "Administração". */
export async function grantAdmin(email: string): Promise<void> {
  const { error } = await getSupabase().rpc('grant_admin', { p_email: normalizeEmail(email) });
  if (error) throw toAccountError(error);
  track('role_granted');
}

export async function revokeAdmin(userId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_admin', { p_user_id: userId });
  if (error) throw toAccountError(error);
  track('role_revoked');
}

export const callingCatalogQueryKey = ['callingCatalog'] as const;

/** RF-06: the active callings for everybody; the admin also gets the inactive ones. */
export async function fetchCallingCatalog(): Promise<Calling[]> {
  const { data, error } = await getSupabase()
    .from('calling_catalog')
    .select(
      'id, name_pt, name_en, name_es, level, access, notify_group, org_chart_section, sort_order, active',
    )
    .order('level')
    .order('sort_order');
  if (error) throw toAccountError(error);
  const catalog: Calling[] = [];
  for (const row of data ?? []) {
    const calling = callingFromRow(row);
    if (calling) catalog.push(calling);
  }
  return catalog;
}

/** RF-07, RF-21. `id: null` creates a calling. Returns the calling id. */
export async function saveCalling(
  input: Omit<Calling, 'id' | 'sortOrder'> & { id: string | null },
): Promise<string> {
  // The generated types say `string`, but the SQL function accepts null for these arguments.
  const { data, error } = await getSupabase().rpc('save_calling', {
    p_id: input.id as string,
    p_name_pt: input.namePt,
    p_name_en: input.nameEn as string,
    p_name_es: input.nameEs as string,
    p_level: input.level,
    p_access: input.access,
    p_notify_group: input.notifyGroup as string,
    p_org_chart_section: input.orgChartSection as string,
    p_active: input.active,
  });
  if (error) throw toAccountError(error);
  track('calling_catalog_saved', { calling_id: data });
  return data;
}

/** RF-21, RF-22: how many people have the calling (admin only). */
export async function callingHolderCount(id: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('calling_holder_count', { p_id: id });
  if (error) throw toAccountError(error);
  return data;
}

/** RF-17, RF-19. */
export async function setOrgChartConsent(memberCallId: string, accepted: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_org_chart_consent', {
    p_member_call_id: memberCallId,
    p_accepted: accepted,
  });
  if (error) throw toAccountError(error);
  track('org_chart_consent_changed', { membership_id: memberCallId });
}
