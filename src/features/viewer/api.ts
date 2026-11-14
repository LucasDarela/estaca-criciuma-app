import type { LeadershipGroup, Membership } from '@/domain/permissions';
import { isLeadershipGroup, isRole } from '@/domain/permissions';
import type { Locale, Organization, Profile } from '@/domain/profile';
import { isUnitId } from '@/domain/units';
import { getSupabase } from '@/lib/supabase';

export type ViewerData = { profile: Profile | null; memberships: Membership[] };

export const viewerQueryKey = (userId: string) => ['viewer', userId] as const;

const locales: readonly string[] = ['pt-BR', 'en-US', 'es-MX'];
const organizations: readonly string[] = [
  'relief_society',
  'elders_quorum',
  'young_women',
  'young_men',
  'primary',
];

/**
 * Loads the user's profile and memberships. Rows with unknown role/unit are dropped (never grant
 * on unexpected data). Throws on any Supabase error.
 */
export async function fetchViewerData(userId: string): Promise<ViewerData> {
  const supabase = getSupabase();
  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, home_unit_id, locale, organizations, consented_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('memberships').select('unit_id, role, leadership_group').eq('user_id', userId),
  ]);
  if (profileResult.error) throw profileResult.error;
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

  const memberships: Membership[] = [];
  for (const m of membershipsResult.data ?? []) {
    if (!isUnitId(m.unit_id) || !isRole(m.role)) continue;
    const leadershipGroup: LeadershipGroup | null =
      m.leadership_group && isLeadershipGroup(m.leadership_group) ? m.leadership_group : null;
    memberships.push({ unitId: m.unit_id, role: m.role, leadershipGroup });
  }

  return { profile, memberships };
}
