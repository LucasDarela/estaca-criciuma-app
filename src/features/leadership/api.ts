import { useQuery, useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { isOrgChartSection } from '@/domain/callings';
import {
  isStakeCounselorCalling,
  isUnitCounselorCalling,
  linkOrganizations,
  type LinkOrganization,
  type OrgChartLink,
  type OrgChartMember,
  type StakeCounselorCallingId,
  type UnitCounselorCallingId,
} from '@/domain/orgChart';
import { isUnitId, type UnitId } from '@/domain/units';
import { PERSIST_MAX_AGE_MS, PUBLIC_STALE_TIME_MS } from '@/lib/queryPersistence';
import { rpcErrorCode } from '@/lib/rpcError';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

export const leadershipMembersQueryKey = ['public', 'leadership', 'members'] as const;
export const leadershipLinksQueryKey = ['public', 'leadership', 'links'] as const;
/** RNF-02: never 'public'. The userId keeps one account's cache away from another. */
export const leadershipPhonesQueryKey = (userId: string) =>
  ['leadership', 'phones', userId] as const;

export type LeadershipErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'invalid_counselor'
  | 'no_counselor'
  | 'invalid_unit'
  | 'invalid_organization'
  | 'network'
  | 'unknown';

export class LeadershipError extends Error {
  constructor(readonly code: LeadershipErrorCode) {
    super(code);
    this.name = 'LeadershipError';
  }
}

const knownCodes: readonly LeadershipErrorCode[] = [
  'forbidden',
  'not_found',
  'invalid_counselor',
  'no_counselor',
  'invalid_unit',
  'invalid_organization',
];

/** RPCs return a short code in `message`; a failed fetch is `network`; anything else is `unknown`. */
export function toLeadershipError(error: unknown): LeadershipError {
  if (error instanceof LeadershipError) return error;
  return new LeadershipError(rpcErrorCode(error, knownCodes));
}

/** Drops rows with an unknown unit or section (never render unexpected data). */
export async function fetchOrgChartMembers(): Promise<OrgChartMember[]> {
  const { data, error } = await getSupabase().rpc('org_chart_members');
  if (error) throw toLeadershipError(error);
  const members: OrgChartMember[] = [];
  for (const row of data ?? []) {
    if (!isUnitId(row.unit_id) || !isOrgChartSection(row.section)) continue;
    members.push({
      memberCallId: row.member_call_id,
      unitId: row.unit_id,
      section: row.section,
      calling: {
        id: row.calling_id,
        namePt: row.calling_name_pt,
        nameEn: row.calling_name_en,
        nameEs: row.calling_name_es,
      },
      displayName: row.display_name,
      sortOrder: row.sort_order,
    });
  }
  return members;
}

function isLinkOrganization(value: string | null): value is LinkOrganization {
  return (linkOrganizations as readonly (string | null)[]).includes(value);
}

/** Drops rows with an unknown kind, unit, organization or counselor calling. */
export async function fetchOrgChartLinks(): Promise<OrgChartLink[]> {
  const { data, error } = await getSupabase().rpc('org_chart_links');
  if (error) throw toLeadershipError(error);
  const links: OrgChartLink[] = [];
  for (const row of data ?? []) {
    const memberCallId = row.member_call_id as string | null;
    const targetUnitId = row.target_unit_id as string | null;
    const organization = row.organization as string | null;
    const counselor = row.counselor_calling_id as string | null;
    if (
      row.kind === 'high_council_counselor' &&
      memberCallId !== null &&
      isStakeCounselorCalling(counselor)
    ) {
      links.push({ kind: 'high_council_counselor', memberCallId, counselorCallingId: counselor });
    } else if (
      row.kind === 'high_council_unit' &&
      memberCallId !== null &&
      targetUnitId !== null &&
      isUnitId(targetUnitId)
    ) {
      links.push({ kind: 'high_council_unit', memberCallId, targetUnitId });
    } else if (
      row.kind === 'unit_org_counselor' &&
      isUnitId(row.unit_id) &&
      isLinkOrganization(organization) &&
      isUnitCounselorCalling(counselor)
    ) {
      links.push({
        kind: 'unit_org_counselor',
        unitId: row.unit_id,
        organization,
        counselorCallingId: counselor,
      });
    }
  }
  return links;
}

/** memberCallId -> phone_e164. Only for signed-in callers (RNF-02). */
export async function fetchOrgChartPhones(): Promise<Record<string, string>> {
  const { data, error } = await getSupabase().rpc('org_chart_phones');
  if (error) throw toLeadershipError(error);
  const phones: Record<string, string> = {};
  for (const row of data ?? []) phones[row.member_call_id] = row.phone_e164;
  return phones;
}

export type OrgChartData = {
  members: OrgChartMember[];
  links: OrgChartLink[];
  /** 'offline' = no data and cannot fetch (paused); 'error' = no data and the fetch failed. */
  status: 'loading' | 'error' | 'offline' | 'success';
  /** Reloads members and links (retry, or a person left the tree: RF-26). */
  refetch: () => Promise<void>;
  refetchLinks: () => Promise<void>;
};

type Combined = Pick<OrgChartData, 'members' | 'links' | 'status'>;

const noMembers: OrgChartMember[] = [];
const noLinks: OrgChartLink[] = [];
/** Prefix of both public org chart keys (not the phones key, which is not public). */
const leadershipPublicPrefix = ['public', 'leadership'] as const;

/** Module scope, so useQueries only re-runs it when a result changes. */
function combine(
  results: [UseQueryResult<OrgChartMember[]>, UseQueryResult<OrgChartLink[]>],
): Combined {
  const [members, links] = results;
  const missing = members.data === undefined || links.data === undefined;
  let status: Combined['status'] = 'success';
  if (missing) {
    if (results.some((r) => r.data === undefined && r.fetchStatus === 'paused')) status = 'offline';
    else if (results.some((r) => r.data === undefined && r.isError)) status = 'error';
    else status = 'loading';
  }
  return { members: members.data ?? noMembers, links: links.data ?? noLinks, status };
}

/** Both public queries: staleTime PUBLIC_STALE_TIME_MS, gcTime PERSIST_MAX_AGE_MS (RNF-08). */
export function useOrgChart(): OrgChartData {
  const client = useQueryClient();
  const combined = useQueries({
    queries: [
      {
        queryKey: leadershipMembersQueryKey,
        queryFn: fetchOrgChartMembers,
        staleTime: PUBLIC_STALE_TIME_MS,
        gcTime: PERSIST_MAX_AGE_MS,
      },
      {
        queryKey: leadershipLinksQueryKey,
        queryFn: fetchOrgChartLinks,
        staleTime: PUBLIC_STALE_TIME_MS,
        gcTime: PERSIST_MAX_AGE_MS,
      },
    ],
    combine,
  });
  const refetch = useCallback(
    () => client.refetchQueries({ queryKey: leadershipPublicPrefix }),
    [client],
  );
  const refetchLinks = useCallback(
    () => client.refetchQueries({ queryKey: leadershipLinksQueryKey }),
    [client],
  );
  return useMemo(() => ({ ...combined, refetch, refetchLinks }), [combined, refetch, refetchLinks]);
}

/** RF-19, RNF-08: enabled only with a session and once a sheet is opened; staleTime 5 min. */
export function useOrgChartPhones(
  userId: string | null,
  enabled: boolean,
): UseQueryResult<Record<string, string>> {
  return useQuery({
    queryKey: leadershipPhonesQueryKey(userId ?? ''),
    queryFn: fetchOrgChartPhones,
    enabled: userId !== null && enabled,
    staleTime: PUBLIC_STALE_TIME_MS,
  });
}

/** RF-05. The database revalidates every rule. */
export async function setHighCouncilorLinks(input: {
  highCouncilorCallId: string;
  counselorCallingId: StakeCounselorCallingId | null;
  unitIds: readonly UnitId[];
}): Promise<void> {
  // The generated types say `string`, but the SQL function accepts null here.
  const { error } = await getSupabase().rpc('set_high_councilor_links', {
    p_high_councilor_call_id: input.highCouncilorCallId,
    p_counselor_calling_id: input.counselorCallingId as string,
    p_unit_ids: [...input.unitIds],
  });
  if (error) throw toLeadershipError(error);
  track('org_chart_link_saved', { kind: 'high_council', unit_id: 'estaca' });
}

/** RF-06. */
export async function setUnitOrgCounselor(input: {
  unitId: UnitId;
  organization: LinkOrganization;
  counselorCallingId: UnitCounselorCallingId | null;
}): Promise<void> {
  const { error } = await getSupabase().rpc('set_unit_org_counselor', {
    p_unit_id: input.unitId,
    p_organization: input.organization,
    p_counselor_calling_id: input.counselorCallingId as string,
  });
  if (error) throw toLeadershipError(error);
  track('org_chart_link_saved', { kind: 'unit_org', unit_id: input.unitId });
}
