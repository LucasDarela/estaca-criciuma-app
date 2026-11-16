import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { OrgChartLink, OrgChartMember } from '@/domain/orgChart';

import { leadershipLinksQueryKey, leadershipMembersQueryKey } from './api';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Providers shared by the screen tests. */
export function Providers({ client, children }: { client: QueryClient; children: ReactElement }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

type MemberRow = {
  member_call_id: string;
  unit_id: string;
  section: string;
  calling_id: string;
  calling_name_pt: string;
  display_name: string;
  sort_order: number;
};

/** A row of `org_chart_members()`. */
export function memberRow(
  id: string,
  unitId: string,
  section: string,
  callingId: string,
  callingNamePt: string,
  displayName: string,
  sortOrder = 100,
): MemberRow & { calling_name_en: null; calling_name_es: null } {
  return {
    member_call_id: id,
    unit_id: unitId,
    section,
    calling_id: callingId,
    calling_name_pt: callingNamePt,
    calling_name_en: null,
    calling_name_es: null,
    display_name: displayName,
    sort_order: sortOrder,
  };
}

/** A row of `org_chart_links()`. */
export function linkRow(overrides: Record<string, unknown>) {
  return {
    kind: 'high_council_unit',
    unit_id: 'estaca',
    member_call_id: null,
    organization: null,
    counselor_calling_id: null,
    target_unit_id: null,
    ...overrides,
  };
}

/** A fake supabase `rpc` answering the three org chart functions. */
export function rpcFor(data: { members?: unknown[]; links?: unknown[]; phones?: unknown[] }) {
  return jest.fn(async (name: string) => {
    if (name === 'org_chart_members') return { data: data.members ?? [], error: null };
    if (name === 'org_chart_links') return { data: data.links ?? [], error: null };
    if (name === 'org_chart_phones') return { data: data.phones ?? [], error: null };
    return { data: null, error: null };
  });
}

/** Fills the cache the way a previous session would have, so the screen starts with data. */
export function seedCache(
  client: QueryClient,
  members: readonly OrgChartMember[],
  links: readonly OrgChartLink[],
) {
  client.setQueryData(leadershipMembersQueryKey, members);
  client.setQueryData(leadershipLinksQueryKey, links);
}
