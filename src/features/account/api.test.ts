import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { signOut } from '@/lib/authSession';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

import {
  AccountError,
  deleteMyAccount,
  callingHolderCount,
  exportMyData,
  fetchCallingCatalog,
  grantAdmin,
  grantCalling,
  listAccess,
  revokeAdmin,
  revokeCalling,
  saveCalling,
  setOrgChartConsent,
  updateProfile,
} from './api';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ track: jest.fn() }));
jest.mock('@/lib/authSession', () => ({ signOut: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const instances: { create: jest.Mock; write: jest.Mock; uri: string; parts: unknown[] }[] = [];
  class File {
    create = jest.fn();
    write = jest.fn();
    uri = 'file:///cache/meus-dados-estaca-criciuma.json';
    parts: unknown[];
    constructor(...parts: unknown[]) {
      this.parts = parts;
      instances.push(this);
    }
  }
  return { File, Paths: { cache: 'CACHE_DIR' }, __instances: instances };
});

const instances = (
  jest.requireMock('expo-file-system') as { __instances: InstanceType<typeof File>[] }
).__instances as unknown as {
  create: jest.Mock;
  write: jest.Mock;
  uri: string;
  parts: unknown[];
}[];

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null, ...result });
  (getSupabase as jest.Mock).mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
  instances.length = 0;
});

describe('exportMyData', () => {
  it('CA-12: writes the RPC JSON to meus-dados-estaca-criciuma.json and opens the share sheet', async () => {
    const data = { account: { email: 'a@b.co' }, memberships: [], calls: [] };
    const rpc = mockRpc({ data });
    await exportMyData();

    expect(rpc).toHaveBeenCalledWith('export_my_data');
    expect(instances[0]?.parts).toEqual([Paths.cache, 'meus-dados-estaca-criciuma.json']);
    expect(instances[0]?.write).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(instances[0]?.uri, {
      mimeType: 'application/json',
    });
    expect(track).toHaveBeenCalledWith('data_exported');
  });

  it('throws and shares nothing when the RPC fails', async () => {
    mockRpc({ error: new TypeError('Network request failed') });
    await expect(exportMyData()).rejects.toMatchObject({ code: 'network' });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

describe('deleteMyAccount', () => {
  it('CA-13: calls the RPC, tracks and signs out', async () => {
    const rpc = mockRpc({});
    await deleteMyAccount();
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(track).toHaveBeenCalledWith('account_deleted');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('CA-20: last_admin is a typed error and the session stays', async () => {
    mockRpc({ error: { message: 'last_admin' } });
    await expect(deleteMyAccount()).rejects.toBeInstanceOf(AccountError);
    await expect(deleteMyAccount()).rejects.toMatchObject({ code: 'last_admin' });
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('updateProfile', () => {
  it('updates only the given fields of the own row', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    (getSupabase as jest.Mock).mockReturnValue({ from: jest.fn(() => ({ update })) });
    await updateProfile('u1', { displayName: ' Ana ', homeUnitId: null });
    expect(update).toHaveBeenCalledWith({ display_name: 'Ana', home_unit_id: null });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });
});

describe('updateProfile organizations', () => {
  it('CA-20: sends the organizations to the own row', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    (getSupabase as jest.Mock).mockReturnValue({ from: jest.fn(() => ({ update })) });
    await updateProfile('u1', { organizations: ['primary', 'temple_family_history'] });
    expect(update).toHaveBeenCalledWith({ organizations: ['primary', 'temple_family_history'] });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });
});

describe('listAccess', () => {
  const row = (overrides: Record<string, unknown>) => ({
    entry_id: 'e1',
    kind: 'calling',
    user_id: 'u1',
    display_name: 'Ana',
    email: 'ana@exemplo.org',
    unit_id: 'icara',
    calling_id: 'primary_president',
    calling_name_pt: 'Presidente da Primária',
    calling_name_en: 'Primary President',
    calling_name_es: null,
    ...overrides,
  });

  it('maps callings and admins, and drops unknown units and kinds', async () => {
    mockRpc({
      data: [
        row({}),
        row({ entry_id: 'e2', unit_id: 'zzz' }),
        row({ entry_id: 'e3', kind: 'boss' }),
        row({ entry_id: 'e4', calling_id: null, calling_name_pt: null }),
        row({
          entry_id: 'e5',
          kind: 'admin',
          unit_id: 'estaca',
          calling_id: null,
          calling_name_pt: null,
          calling_name_en: null,
        }),
      ],
    });
    await expect(listAccess()).resolves.toEqual([
      {
        entryId: 'e1',
        kind: 'calling',
        userId: 'u1',
        displayName: 'Ana',
        email: 'ana@exemplo.org',
        unitId: 'icara',
        calling: {
          id: 'primary_president',
          namePt: 'Presidente da Primária',
          nameEn: 'Primary President',
          nameEs: null,
        },
      },
      {
        entryId: 'e5',
        kind: 'admin',
        userId: 'u1',
        displayName: 'Ana',
        email: 'ana@exemplo.org',
        unitId: 'estaca',
        calling: null,
      },
    ]);
  });

  it('maps an RPC error code', async () => {
    mockRpc({ error: { message: 'not_authorized' } });
    await expect(listAccess()).rejects.toMatchObject({ code: 'not_authorized' });
  });
});

describe('grantCalling and revokeCalling', () => {
  it('[roles] grantCalling sends the normalized e-mail and tracks only ids', async () => {
    const rpc = mockRpc({ data: 'mc-new' });
    await grantCalling({
      email: '  Membro@Exemplo.org ',
      unitId: 'icara',
      callingId: 'primary_president',
    });
    expect(rpc).toHaveBeenCalledWith('grant_calling', {
      p_email: 'membro@exemplo.org',
      p_unit_id: 'icara',
      p_calling_id: 'primary_president',
    });
    expect(track).toHaveBeenCalledWith('calling_granted', {
      membership_id: 'mc-new',
      calling_id: 'primary_president',
    });
  });

  it.each([
    'no_account',
    'already_granted',
    'not_authorized',
    'no_home_unit',
    'wrong_unit',
    'invalid_calling',
    'invalid_unit_for_calling',
  ])('[roles] grantCalling maps %s', async (code) => {
    mockRpc({ error: { message: code } });
    await expect(
      grantCalling({ email: 'a@b.co', unitId: 'icara', callingId: 'bishop' }),
    ).rejects.toMatchObject({ code });
    expect(track).not.toHaveBeenCalled();
  });

  it('[roles] revokeCalling calls the RPC and tracks the id', async () => {
    const rpc = mockRpc({});
    await revokeCalling('mc1');
    expect(rpc).toHaveBeenCalledWith('revoke_calling', { p_member_call_id: 'mc1' });
    expect(track).toHaveBeenCalledWith('calling_revoked', { membership_id: 'mc1' });
  });

  it('[roles] revokeCalling maps cannot_revoke_self', async () => {
    mockRpc({ error: { message: 'cannot_revoke_self' } });
    await expect(revokeCalling('mc1')).rejects.toMatchObject({ code: 'cannot_revoke_self' });
  });

  it('an unknown server error is unknown', async () => {
    mockRpc({ error: { message: 'boom' } });
    await expect(revokeCalling('mc1')).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('grantAdmin and revokeAdmin', () => {
  it('grantAdmin sends the normalized e-mail', async () => {
    const rpc = mockRpc({});
    await grantAdmin(' Admin@Exemplo.org');
    expect(rpc).toHaveBeenCalledWith('grant_admin', { p_email: 'admin@exemplo.org' });
    expect(track).toHaveBeenCalledWith('role_granted');
  });

  it('revokeAdmin calls the RPC with the user id', async () => {
    const rpc = mockRpc({});
    await revokeAdmin('u9');
    expect(rpc).toHaveBeenCalledWith('revoke_admin', { p_user_id: 'u9' });
    expect(track).toHaveBeenCalledWith('role_revoked');
  });
});

describe('calling catalog', () => {
  const catalogRow = {
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
  };

  it('[roles] fetchCallingCatalog converts the columns and drops unknown rows', async () => {
    const order = jest.fn();
    const select = jest.fn();
    const chain = {
      select,
      order,
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: [catalogRow, { ...catalogRow, id: 'x', level: 'galaxy' }], error: null }),
    };
    select.mockReturnValue(chain);
    order.mockReturnValue(chain);
    (getSupabase as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) });
    await expect(fetchCallingCatalog()).resolves.toEqual([
      {
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
    ]);
    expect(order).toHaveBeenNthCalledWith(1, 'level');
    expect(order).toHaveBeenNthCalledWith(2, 'sort_order');
  });

  it('[roles] saveCalling with id null creates a calling and tracks only its id', async () => {
    const rpc = mockRpc({ data: 'new-id' });
    await expect(
      saveCalling({
        id: null,
        namePt: 'Coordenador de Caravanas',
        nameEn: null,
        nameEs: null,
        level: 'stake',
        access: 'none',
        notifyGroup: 'temple_family_history_workers',
        orgChartSection: null,
        active: true,
      }),
    ).resolves.toBe('new-id');
    expect(rpc).toHaveBeenCalledWith('save_calling', {
      p_id: null,
      p_name_pt: 'Coordenador de Caravanas',
      p_name_en: null,
      p_name_es: null,
      p_level: 'stake',
      p_access: 'none',
      p_notify_group: 'temple_family_history_workers',
      p_org_chart_section: null,
      p_active: true,
    });
    expect(track).toHaveBeenCalledWith('calling_catalog_saved', { calling_id: 'new-id' });
  });

  it.each(['name_taken', 'level_locked', 'in_use', 'invalid_access', 'invalid_section'])(
    '[roles] saveCalling maps %s',
    async (code) => {
      mockRpc({ error: { message: code } });
      await expect(
        saveCalling({
          id: 'bishop',
          namePt: 'Bispo',
          nameEn: null,
          nameEs: null,
          level: 'ward',
          access: 'none',
          notifyGroup: null,
          orgChartSection: null,
          active: true,
        }),
      ).rejects.toMatchObject({ code });
      expect(track).not.toHaveBeenCalled();
    },
  );

  it('[roles] callingHolderCount returns the number', async () => {
    const rpc = mockRpc({ data: 3 });
    await expect(callingHolderCount('bishop')).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith('calling_holder_count', { p_id: 'bishop' });
  });
});

describe('setOrgChartConsent', () => {
  it('[roles] calls the RPC and tracks only the id', async () => {
    const rpc = mockRpc({});
    await setOrgChartConsent('mc1', true);
    expect(rpc).toHaveBeenCalledWith('set_org_chart_consent', {
      p_member_call_id: 'mc1',
      p_accepted: true,
    });
    expect(track).toHaveBeenCalledWith('org_chart_consent_changed', { membership_id: 'mc1' });
  });

  it('[roles] a network failure is network', async () => {
    mockRpc({ error: new TypeError('Network request failed') });
    await expect(setOrgChartConsent('mc1', false)).rejects.toMatchObject({ code: 'network' });
  });
});
