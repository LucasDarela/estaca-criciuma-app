import { getSupabase } from '@/lib/supabase';

import { fetchViewerData } from './api';

jest.mock('@/lib/supabase');

type Result = { data: unknown; error: unknown };

function mockTables(profiles: Result, memberships: Result) {
  (getSupabase as jest.Mock).mockReturnValue({
    from: (table: string) => {
      const result = table === 'profiles' ? profiles : memberships;
      const chain = {
        select: () => chain,
        eq: () => chain,
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

describe('fetchViewerData', () => {
  it('maps rows to Profile and Membership', async () => {
    mockTables(
      { data: profileRow, error: null },
      {
        data: [{ unit_id: 'criciuma1', role: 'unit_leader', leadership_group: 'bishops' }],
        error: null,
      },
    );
    await expect(fetchViewerData('u1')).resolves.toEqual({
      profile: {
        id: 'u1',
        displayName: 'Carlos Exemplo',
        homeUnitId: 'criciuma1',
        locale: 'en-US',
        organizations: ['primary'],
        consentedAt: '2026-11-13T00:00:00Z',
      },
      memberships: [{ unitId: 'criciuma1', role: 'unit_leader', leadershipGroup: 'bishops' }],
    });
  });

  it('drops memberships with an unknown role or unit', async () => {
    mockTables(
      { data: null, error: null },
      {
        data: [
          { unit_id: 'criciuma1', role: 'superuser', leadership_group: null },
          { unit_id: 'nowhere', role: 'unit_leader', leadership_group: null },
          { unit_id: 'icara', role: 'unit_publisher', leadership_group: 'weird' },
        ],
        error: null,
      },
    );
    await expect(fetchViewerData('u1')).resolves.toEqual({
      profile: null,
      memberships: [{ unitId: 'icara', role: 'unit_publisher', leadershipGroup: null }],
    });
  });

  it('falls back to pt-BR for an unknown locale and null for an unknown home unit', async () => {
    mockTables(
      { data: { ...profileRow, locale: 'fr-FR', home_unit_id: 'x' }, error: null },
      { data: [], error: null },
    );
    const { profile } = await fetchViewerData('u1');
    expect(profile?.locale).toBe('pt-BR');
    expect(profile?.homeUnitId).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    mockTables({ data: null, error: new Error('boom') }, { data: [], error: null });
    await expect(fetchViewerData('u1')).rejects.toThrow('boom');
    mockTables({ data: null, error: null }, { data: null, error: new Error('bang') });
    await expect(fetchViewerData('u1')).rejects.toThrow('bang');
  });
});
