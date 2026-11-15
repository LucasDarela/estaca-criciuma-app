import {
  callingFromRow,
  isOrgChartConsent,
  membershipsFromCalls,
  type MemberCall,
} from '@/domain/callings';
import type { Membership } from '@/domain/permissions';
import type { Locale, Organization, Profile } from '@/domain/profile';
import { isUnitId } from '@/domain/units';
import { getSupabase } from '@/lib/supabase';

export type ViewerData = {
  profile: Profile | null;
  /** Access levels: the ones derived from `calls` plus the admin row (RF-09). */
  memberships: Membership[];
  /** The person's callings, oldest grant first. */
  calls: MemberCall[];
};

export const viewerQueryKey = (userId: string) => ['viewer', userId] as const;

const locales: readonly string[] = ['pt-BR', 'en-US', 'es-MX'];
const organizations: readonly string[] = [
  'relief_society',
  'elders_quorum',
  'young_women',
  'young_men',
  'primary',
];

const callSelect =
  'id, unit_id, org_chart_consent, calling_catalog(id, name_pt, name_en, name_es, level, access, notify_group, org_chart_section, sort_order, active)';

/**
 * Loads the user's profile, callings and admin membership. Rows with unknown values are dropped
 * (never grant on unexpected data). Throws on any Supabase error.
 */
export async function fetchViewerData(userId: string): Promise<ViewerData> {
  const supabase = getSupabase();
  const [profileResult, callsResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, home_unit_id, locale, organizations, consented_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('member_calls')
      .select(callSelect)
      .eq('user_id', userId)
      .order('granted_at', { ascending: true }),
    supabase.from('memberships').select('unit_id, role').eq('user_id', userId),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (callsResult.error) throw callsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const row = profileResult.data;
  const profile: Profile | null = row
    ? {
        id: row.id,
        displayName: row.display_name,
        homeUnitId: row.home_unit_id && isUnitId(row.home_unit_id) ? row.home_unit_id : null,
        locale: locales.includes(row.locale) ? (row.locale as Locale) : 'pt-BR',
        organizations: row.organizations.filter((o): o is Organization =>
          organizations.includes(o),
        ),
        consentedAt: row.consented_at,
      }
    : null;

  const calls: MemberCall[] = [];
  for (const call of callsResult.data ?? []) {
    const calling = call.calling_catalog ? callingFromRow(call.calling_catalog) : null;
    if (!calling || !isUnitId(call.unit_id)) continue;
    const consent = call.org_chart_consent;
    calls.push({
      id: call.id,
      unitId: call.unit_id,
      calling,
      orgChartConsent: consent !== null && isOrgChartConsent(consent) ? consent : null,
    });
  }

  const memberships = membershipsFromCalls(calls);
  for (const m of membershipsResult.data ?? []) {
    // memberships holds only the admin (RF-08); anything else is unexpected and ignored.
    if (isUnitId(m.unit_id) && m.role === 'admin') {
      memberships.push({ unitId: m.unit_id, role: 'admin' });
    }
  }

  return { profile, memberships, calls };
}
