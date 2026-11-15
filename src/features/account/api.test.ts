import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { signOut } from '@/lib/authSession';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

import {
  AccountError,
  deleteMyAccount,
  exportMyData,
  grantRole,
  listAccess,
  revokeRole,
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
    const data = { account: { email: 'a@b.co' }, memberships: [] };
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

describe('listAccess', () => {
  it('maps rows and drops unknown units and roles', async () => {
    mockRpc({
      data: [
        {
          membership_id: 'm1',
          user_id: 'u1',
          display_name: 'Ana',
          email: 'ana@exemplo.org',
          unit_id: 'icara',
          role: 'unit_leader',
          leadership_group: 'bishops',
        },
        {
          membership_id: 'm2',
          user_id: 'u2',
          display_name: 'X',
          email: 'x@y.z',
          unit_id: 'zzz',
          role: 'unit_leader',
          leadership_group: null,
        },
        {
          membership_id: 'm3',
          user_id: 'u3',
          display_name: 'Y',
          email: 'y@y.z',
          unit_id: 'icara',
          role: 'boss',
          leadership_group: null,
        },
        {
          membership_id: 'm4',
          user_id: 'u4',
          display_name: 'Z',
          email: 'z@y.z',
          unit_id: 'estaca',
          role: 'admin',
          leadership_group: 'weird',
        },
      ],
    });
    await expect(listAccess()).resolves.toEqual([
      {
        membershipId: 'm1',
        userId: 'u1',
        displayName: 'Ana',
        email: 'ana@exemplo.org',
        unitId: 'icara',
        role: 'unit_leader',
        leadershipGroup: 'bishops',
      },
      {
        membershipId: 'm4',
        userId: 'u4',
        displayName: 'Z',
        email: 'z@y.z',
        unitId: 'estaca',
        role: 'admin',
        leadershipGroup: null,
      },
    ]);
  });

  it('maps an RPC error code', async () => {
    mockRpc({ error: { message: 'not_authorized' } });
    await expect(listAccess()).rejects.toMatchObject({ code: 'not_authorized' });
  });
});

describe('grantRole and revokeRole', () => {
  it('grantRole calls the RPC and tracks only the membership id', async () => {
    const rpc = mockRpc({ data: 'm-new' });
    await grantRole({
      email: 'membro@exemplo.org',
      unitId: 'icara',
      role: 'unit_leader',
      leadershipGroup: 'bishops',
    });
    expect(rpc).toHaveBeenCalledWith('grant_role', {
      p_email: 'membro@exemplo.org',
      p_unit_id: 'icara',
      p_role: 'unit_leader',
      p_leadership_group: 'bishops',
    });
    expect(track).toHaveBeenCalledWith('role_granted', { membership_id: 'm-new' });
  });

  it.each(['no_account', 'already_granted', 'not_authorized'])(
    'grantRole maps %s',
    async (code) => {
      mockRpc({ error: { message: code } });
      await expect(
        grantRole({ email: 'a@b.co', unitId: 'icara', role: 'unit_leader', leadershipGroup: null }),
      ).rejects.toMatchObject({ code });
      expect(track).not.toHaveBeenCalled();
    },
  );

  it('revokeRole calls the RPC and tracks the id', async () => {
    const rpc = mockRpc({});
    await revokeRole('m1');
    expect(rpc).toHaveBeenCalledWith('revoke_role', { p_membership_id: 'm1' });
    expect(track).toHaveBeenCalledWith('role_revoked', { membership_id: 'm1' });
  });

  it('an unknown server error is unknown', async () => {
    mockRpc({ error: { message: 'boom' } });
    await expect(revokeRole('m1')).rejects.toMatchObject({ code: 'unknown' });
  });
});
