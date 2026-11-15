import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Calling, MemberCall } from '@/domain/callings';
import type { ViewerSession } from '@/domain/permissions';
import { tabsFor } from '@/domain/tabs';

import { fetchViewerData, viewerQueryKey, type ViewerData } from './api';
import { useViewer, ViewerProvider } from './ViewerProvider';

jest.mock('./api', () => ({ ...jest.requireActual('./api'), fetchViewerData: jest.fn() }));

const fetchMock = fetchViewerData as jest.Mock;

const leaderData: ViewerData = {
  profile: null,
  memberships: [{ unitId: 'criciuma1', role: 'unit_leader' }],
  calls: [],
};

const calling = (id: string, access: Calling['access'], level: Calling['level']): Calling => ({
  id,
  namePt: id,
  nameEn: null,
  nameEs: null,
  level,
  access,
  notifyGroup: null,
  orgChartSection: null,
  sortOrder: 10,
  active: true,
});

function setup(session: ViewerSession | null, queryClient = newClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ViewerProvider session={session}>{children}</ViewerProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useViewer(), { wrapper });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('ViewerProvider', () => {
  it('CA-09: without a session the viewer is a visitor and nothing is fetched', async () => {
    const { result } = await setup(null);
    expect(result.current.kind).toBe('visitor');
    expect(result.current.userId).toBeNull();
    expect(result.current.canPublish('estaca')).toBe(false);
    expect(result.current.publishableUnits).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CA-10: a unit leader session loads as leader of its own unit only', async () => {
    fetchMock.mockResolvedValue(leaderData);
    const { result } = await setup({ userId: 'u-bispo' });
    await waitFor(() => expect(result.current.kind).toBe('leader'));
    expect(fetchMock).toHaveBeenCalledWith('u-bispo');
    expect(result.current.canLead('criciuma1')).toBe(true);
    expect(result.current.canLead('icara')).toBe(false);
    expect(result.current.leadableUnits).toEqual(['criciuma1']);
  });

  it('[roles] CA-07: high_councilor and sunday_school_teacher make a leader with the Chamados tab', async () => {
    const calls: MemberCall[] = [
      {
        id: 'mc1',
        unitId: 'estaca',
        calling: calling('high_councilor', 'stake_leader', 'stake'),
        orgChartConsent: null,
      },
      {
        id: 'mc2',
        unitId: 'criciuma3',
        calling: calling('sunday_school_teacher', 'none', 'ward_branch'),
        orgChartConsent: null,
      },
    ];
    fetchMock.mockResolvedValue({
      profile: null,
      memberships: [{ unitId: 'estaca', role: 'stake_leader' }],
      calls,
    });
    const { result } = await setup({ userId: 'u-sumo' });
    await waitFor(() => expect(result.current.kind).toBe('leader'));
    expect(tabsFor(result.current.kind).map((tab) => tab.route)).toContain('callings');
    expect(result.current.calls).toHaveLength(2);
  });

  it('CA-11: a failed load with no cache is a member without permissions', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const { result } = await setup({ userId: 'u1' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.kind).toBe('member');
    expect(result.current.canPublish('estaca')).toBe(false);
    expect(result.current.publishableUnits).toEqual([]);
    expect(result.current.leadableUnits).toEqual([]);
  });

  it('keeps the cached viewer when a refetch fails (7.4)', async () => {
    const queryClient = newClient();
    queryClient.setQueryData(viewerQueryKey('u1'), leaderData);
    fetchMock.mockRejectedValue(new Error('network'));
    const { result } = await setup({ userId: 'u1' }, queryClient);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.kind).toBe('leader');
  });

  it('7.6: reloads the viewer every 5 minutes so a revoked role reaches the app', async () => {
    fetchMock.mockResolvedValue(leaderData);
    const queryClient = newClient();
    await setup({ userId: 'u1' }, queryClient);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const query = queryClient.getQueryCache().find({ queryKey: viewerQueryKey('u1') });
    expect(query?.observers[0]?.options.refetchInterval).toBe(5 * 60_000);
  });

  it('useViewer throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useViewer())).rejects.toThrow(
      'useViewer must be used inside ViewerProvider',
    );
  });
});
