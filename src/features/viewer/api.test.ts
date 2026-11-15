import { getSupabase } from '@/lib/supabase';

import { fetchViewerData } from './api';

jest.mock('@/lib/supabase');

type Result = { data: unknown; error: unknown };

function mockTables(profiles: Result, calls: Result, memberships: Result) {
  (getSupabase as jest.Mock).mockReturnValue({
    from: (table: string) => {
      const result =
        table === 'profiles' ? profiles : table === 'member_calls' ? calls : memberships;
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (value: Result) => unknown) => resolve(result),
      };
      return chain;
    },
  });
}

const profileRow = {
  id: 'u1',
  display_name: 'Carlos Exemplo',
  home_unit_id: 'criciuma1',
  locale: 'en-US',
  organizations: ['primary', 'bogus'],
  consented_at: '2026-11-13T00:00:00Z',
};

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'bishop',
  name_pt: 'Bispo',
  name_en: 'Bishop',
  name_es: 'Obispo',
  level: 'ward',
  access: 'unit_leader',
  notify_group: 'bishoprics',
  org_chart_section: 'bishopric',
  sort_order: 20,
  active: true,
  ...overrides,
});

const callRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'mc1',
  unit_id: 'criciuma1',
  org_chart_consent: 'pending',
  calling_catalog: catalogRow(),
  ...overrides,
});

const none: Result = { data: [], error: null };

describe('fetchViewerData', () => {
  it('maps rows to Profile, calls and the memberships derived from them', async () => {
    mockTables({ data: profileRow, error: null }, { data: [callRow()], error: null }, none);
    const data = await fetchViewerData('u1');
    expect(data.profile).toEqual({
      id: 'u1',
      displayName: 'Carlos Exemplo',
      homeUnitId: 'criciuma1',
      locale: 'en-US',
      organizations: ['primary'],
      consentedAt: '2026-11-13T00:00:00Z',
    });
    expect(data.memberships).toEqual([{ unitId: 'criciuma1', role: 'unit_leader' }]);
    expect(data.calls).toEqual([
      {
        id: 'mc1',
        unitId: 'criciuma1',
        orgChartConsent: 'pending',
        calling: {
          id: 'bishop',
          namePt: 'Bispo',
          nameEn: 'Bishop',
          nameEs: 'Obispo',
          level: 'ward',
          access: 'unit_leader',
          notifyGroup: 'bishoprics',
          orgChartSection: 'bishopric',
          sortOrder: 20,
          active: true,
        },
      },
    ]);
  });

  it('adds the admin row from memberships and ignores any other role there', async () => {
    mockTables(
      { data: null, error: null },
      { data: [], error: null },
      {
        data: [
          { unit_id: 'estaca', role: 'admin' },
          { unit_id: 'icara', role: 'unit_leader' },
        ],
        error: null,
      },
    );
    await expect(fetchViewerData('u1')).resolves.toEqual({
      profile: null,
      memberships: [{ unitId: 'estaca', role: 'admin' }],
      calls: [],
    });
  });

  it('a calling without access keeps the person a member but is still listed', async () => {
    mockTables(
      { data: null, error: null },
      {
        data: [
          callRow({
            calling_catalog: catalogRow({
              id: 'sunday_school_teacher',
              level: 'ward_branch',
              access: 'none',
              org_chart_section: null,
            }),
            org_chart_consent: null,
          }),
        ],
        error: null,
      },
      none,
    );
    const data = await fetchViewerData('u1');
    expect(data.memberships).toEqual([]);
    expect(data.calls).toHaveLength(1);
    expect(data.calls[0]?.orgChartConsent).toBeNull();
  });

  it('an inactive calling grants nothing', async () => {
    mockTables(
      { data: null, error: null },
      { data: [callRow({ calling_catalog: catalogRow({ active: false }) })], error: null },
      none,
    );
    await expect(fetchViewerData('u1')).resolves.toMatchObject({ memberships: [] });
  });

  it('drops calls with an unknown unit, calling values or no calling row', async () => {
    mockTables(
      { data: null, error: null },
      {
        data: [
          callRow({ unit_id: 'nowhere' }),
          callRow({ calling_catalog: catalogRow({ access: 'root' }) }),
          callRow({ calling_catalog: null }),
          callRow({ id: 'ok', org_chart_consent: 'weird' }),
        ],
        error: null,
      },
      none,
    );
    const data = await fetchViewerData('u1');
    expect(data.calls.map((c) => c.id)).toEqual(['ok']);
    expect(data.calls[0]?.orgChartConsent).toBeNull();
  });

  it('falls back to pt-BR for an unknown locale and null for an unknown home unit', async () => {
    mockTables(
      { data: { ...profileRow, locale: 'fr-FR', home_unit_id: 'x' }, error: null },
      none,
      none,
    );
    const { profile } = await fetchViewerData('u1');
    expect(profile?.locale).toBe('pt-BR');
    expect(profile?.homeUnitId).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    mockTables({ data: null, error: new Error('boom') }, none, none);
    await expect(fetchViewerData('u1')).rejects.toThrow('boom');
    mockTables({ data: null, error: null }, { data: null, error: new Error('calls') }, none);
    await expect(fetchViewerData('u1')).rejects.toThrow('calls');
    mockTables({ data: null, error: null }, none, { data: null, error: new Error('bang') });
    await expect(fetchViewerData('u1')).rejects.toThrow('bang');
  });
});
