import { isPublicQueryKey } from '@/lib/queryPersistence';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

import {
  LeadershipError,
  fetchOrgChartLinks,
  fetchOrgChartMembers,
  fetchOrgChartPhones,
  leadershipLinksQueryKey,
  leadershipMembersQueryKey,
  leadershipPhonesQueryKey,
  setHighCouncilorLinks,
  setUnitOrgCounselor,
} from './api';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ track: jest.fn() }));

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null, ...result });
  (getSupabase as jest.Mock).mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => jest.clearAllMocks());

const memberRow = (overrides: Record<string, unknown> = {}) => ({
  member_call_id: 'c1',
  unit_id: 'icara',
  section: 'bishopric',
  calling_id: 'bishop',
  calling_name_pt: 'Bispo',
  calling_name_en: 'Bishop',
  calling_name_es: null,
  display_name: 'Ana',
  sort_order: 400,
  ...overrides,
});

describe('fetchOrgChartMembers', () => {
  it('[leadership] maps rows and drops unknown units and sections', async () => {
    const rpc = mockRpc({
      data: [
        memberRow(),
        memberRow({ member_call_id: 'c2', unit_id: 'xyz' }),
        memberRow({ member_call_id: 'c3', section: 'mystery' }),
      ],
    });
    await expect(fetchOrgChartMembers()).resolves.toEqual([
      {
        memberCallId: 'c1',
        unitId: 'icara',
        section: 'bishopric',
        calling: { id: 'bishop', namePt: 'Bispo', nameEn: 'Bishop', nameEs: null },
        displayName: 'Ana',
        sortOrder: 400,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('org_chart_members');
  });

  it('[leadership] P0001 codes become LeadershipError, a failed fetch is network', async () => {
    mockRpc({ error: { message: 'forbidden' } });
    await expect(fetchOrgChartMembers()).rejects.toBeInstanceOf(LeadershipError);
    mockRpc({ error: new TypeError('Network request failed') });
    await expect(fetchOrgChartMembers()).rejects.toMatchObject({ code: 'network' });
    mockRpc({ error: { message: 'boom' } });
    await expect(fetchOrgChartMembers()).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('fetchOrgChartLinks', () => {
  it('[leadership] maps the three kinds and drops unknown rows', async () => {
    mockRpc({
      data: [
        {
          kind: 'high_council_counselor',
          unit_id: 'estaca',
          member_call_id: 'h1',
          organization: null,
          counselor_calling_id: 'stake_first_counselor',
          target_unit_id: null,
        },
        {
          kind: 'high_council_unit',
          unit_id: 'estaca',
          member_call_id: 'h1',
          organization: null,
          counselor_calling_id: null,
          target_unit_id: 'icara',
        },
        {
          kind: 'unit_org_counselor',
          unit_id: 'criciuma1',
          member_call_id: null,
          organization: 'primary',
          counselor_calling_id: 'bishopric_second_counselor',
          target_unit_id: null,
        },
        {
          kind: 'mystery',
          unit_id: 'estaca',
          member_call_id: 'h1',
          organization: null,
          counselor_calling_id: null,
          target_unit_id: null,
        },
        {
          kind: 'high_council_unit',
          unit_id: 'estaca',
          member_call_id: 'h1',
          organization: null,
          counselor_calling_id: null,
          target_unit_id: 'xyz',
        },
        {
          kind: 'unit_org_counselor',
          unit_id: 'criciuma1',
          member_call_id: null,
          organization: 'young_men',
          counselor_calling_id: 'bishopric_second_counselor',
          target_unit_id: null,
        },
        {
          kind: 'unit_org_counselor',
          unit_id: 'criciuma1',
          member_call_id: null,
          organization: 'primary',
          counselor_calling_id: 'bishop',
          target_unit_id: null,
        },
        {
          kind: 'high_council_counselor',
          unit_id: 'estaca',
          member_call_id: 'h1',
          organization: null,
          counselor_calling_id: 'bishop',
          target_unit_id: null,
        },
      ],
    });
    await expect(fetchOrgChartLinks()).resolves.toEqual([
      {
        kind: 'high_council_counselor',
        memberCallId: 'h1',
        counselorCallingId: 'stake_first_counselor',
      },
      { kind: 'high_council_unit', memberCallId: 'h1', targetUnitId: 'icara' },
      {
        kind: 'unit_org_counselor',
        unitId: 'criciuma1',
        organization: 'primary',
        counselorCallingId: 'bishopric_second_counselor',
      },
    ]);
  });
});

describe('fetchOrgChartPhones', () => {
  it('[leadership] CA-20: maps member_call_id to phone', async () => {
    const rpc = mockRpc({ data: [{ member_call_id: 'c1', phone_e164: '+5548999990000' }] });
    await expect(fetchOrgChartPhones()).resolves.toEqual({ c1: '+5548999990000' });
    expect(rpc).toHaveBeenCalledWith('org_chart_phones');
  });
});

describe('query keys', () => {
  it('[leadership] CA-23: members and links are persisted, phones never', () => {
    expect(isPublicQueryKey(leadershipMembersQueryKey)).toBe(true);
    expect(isPublicQueryKey(leadershipLinksQueryKey)).toBe(true);
    expect(isPublicQueryKey(leadershipPhonesQueryKey('u'))).toBe(false);
  });
});

describe('saving links', () => {
  it('[leadership] CA-31: setHighCouncilorLinks tracks only kind and unit_id', async () => {
    const rpc = mockRpc({});
    await setHighCouncilorLinks({
      highCouncilorCallId: 'h1',
      counselorCallingId: 'stake_second_counselor',
      unitIds: ['icara', 'ararangua'],
    });
    expect(rpc).toHaveBeenCalledWith('set_high_councilor_links', {
      p_high_councilor_call_id: 'h1',
      p_counselor_calling_id: 'stake_second_counselor',
      p_unit_ids: ['icara', 'ararangua'],
    });
    expect(track).toHaveBeenCalledWith('org_chart_link_saved', {
      kind: 'high_council',
      unit_id: 'estaca',
    });
    const [, props] = (track as jest.Mock).mock.calls[0];
    expect(Object.keys(props).sort()).toEqual(['kind', 'unit_id']);
  });

  it('[leadership] CA-31: setUnitOrgCounselor tracks only kind and unit_id', async () => {
    const rpc = mockRpc({});
    await setUnitOrgCounselor({
      unitId: 'criciuma1',
      organization: 'sunday_school',
      counselorCallingId: null,
    });
    expect(rpc).toHaveBeenCalledWith('set_unit_org_counselor', {
      p_unit_id: 'criciuma1',
      p_organization: 'sunday_school',
      p_counselor_calling_id: null,
    });
    expect(track).toHaveBeenCalledWith('org_chart_link_saved', {
      kind: 'unit_org',
      unit_id: 'criciuma1',
    });
    const [, props] = (track as jest.Mock).mock.calls[0];
    expect(Object.keys(props).sort()).toEqual(['kind', 'unit_id']);
  });

  it('[leadership] a database error is typed and nothing is tracked', async () => {
    mockRpc({ error: { message: 'no_counselor' } });
    await expect(
      setUnitOrgCounselor({
        unitId: 'criciuma1',
        organization: 'primary',
        counselorCallingId: 'bishopric_first_counselor',
      }),
    ).rejects.toMatchObject({ code: 'no_counselor' });
    expect(track).not.toHaveBeenCalled();
  });
});
