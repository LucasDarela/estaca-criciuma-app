import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

import { AuthFlowError, completeWelcome, requestCode, toAuthFlowError, verifyCode } from './api';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ track: jest.fn() }));

const api = (status: number, code?: string) => new AuthApiError('server message', status, code);

describe('toAuthFlowError', () => {
  it('CA-06: status 429 and rate limit codes are rate_limited', () => {
    expect(toAuthFlowError(api(429)).code).toBe('rate_limited');
    expect(toAuthFlowError(api(400, 'over_email_send_rate_limit')).code).toBe('rate_limited');
    expect(toAuthFlowError(api(400, 'over_request_rate_limit')).code).toBe('rate_limited');
  });

  it('CA-05: otp_expired, invalid_credentials and 400/401/403 are invalid_code', () => {
    expect(toAuthFlowError(api(422, 'otp_expired')).code).toBe('invalid_code');
    expect(toAuthFlowError(api(422, 'invalid_credentials')).code).toBe('invalid_code');
    for (const status of [400, 401, 403]) {
      expect(toAuthFlowError(api(status)).code).toBe('invalid_code');
    }
  });

  it('retryable fetch errors and fetch TypeErrors are network', () => {
    expect(toAuthFlowError(new AuthRetryableFetchError('x', 0)).code).toBe('network');
    expect(toAuthFlowError(new TypeError('Network request failed')).code).toBe('network');
  });

  it('anything else is unknown, and the message is never carried', () => {
    const error = toAuthFlowError(api(500));
    expect(error.code).toBe('unknown');
    expect(error.message).not.toContain('server message');
    expect(toAuthFlowError(new Error('boom')).code).toBe('unknown');
  });

  it('keeps an AuthFlowError as is', () => {
    const original = new AuthFlowError('network');
    expect(toAuthFlowError(original)).toBe(original);
  });
});

function mockClient(overrides: Record<string, unknown>) {
  (getSupabase as jest.Mock).mockReturnValue(overrides);
}

describe('requestCode', () => {
  it('RNF-02: normalizes the e-mail and always allows creating the user', async () => {
    const signInWithOtp = jest.fn().mockResolvedValue({ error: null });
    mockClient({ auth: { signInWithOtp } });
    await requestCode('  Ana@Exemplo.ORG ');
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@exemplo.org',
      options: { shouldCreateUser: true },
    });
  });

  it('throws a mapped error', async () => {
    mockClient({ auth: { signInWithOtp: jest.fn().mockResolvedValue({ error: api(429) }) } });
    await expect(requestCode('a@b.co')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('CA-28: 400, 401 and 403 on requestCode are send_failed, while verifyCode 403 stays invalid_code', async () => {
    for (const status of [400, 401, 403]) {
      mockClient({
        auth: { signInWithOtp: jest.fn().mockResolvedValue({ error: api(status) }) },
      });
      await expect(requestCode('a@b.co')).rejects.toMatchObject({ code: 'send_failed' });
    }
    mockClient({
      auth: { verifyOtp: jest.fn().mockResolvedValue({ data: null, error: api(403) }) },
    });
    await expect(verifyCode('a@b.co', '123456')).rejects.toMatchObject({ code: 'invalid_code' });
  });

  it('maps a rejected fetch to network', async () => {
    mockClient({
      auth: { signInWithOtp: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) },
    });
    await expect(requestCode('a@b.co')).rejects.toMatchObject({ code: 'network' });
  });
});

function profileQuery(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  return { from: jest.fn(() => ({ select })), eq };
}

describe('verifyCode', () => {
  it('verifies as an e-mail OTP, reports consent and tracks only the method', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const query = profileQuery({ data: { consented_at: '2026-11-15T00:00:00Z' }, error: null });
    mockClient({ auth: { verifyOtp }, from: query.from });

    await expect(verifyCode('Ana@Exemplo.org', ' 123456 ')).resolves.toEqual({ consented: true });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'ana@exemplo.org',
      token: '123456',
      type: 'email',
    });
    expect(query.eq).toHaveBeenCalledWith('id', 'u1');
    expect(track).toHaveBeenCalledWith('user_signed_in', { method: 'email_otp' });
  });

  it('without a profile or consented_at the person has not consented', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockClient({ auth: { verifyOtp }, from: profileQuery({ data: null, error: null }).from });
    await expect(verifyCode('a@b.co', '123456')).resolves.toEqual({ consented: false });
  });

  it('throws invalid_code for a wrong code and does not track', async () => {
    (track as jest.Mock).mockClear();
    mockClient({
      auth: {
        verifyOtp: jest
          .fn()
          .mockResolvedValue({ data: { user: null }, error: api(403, 'otp_expired') }),
      },
    });
    await expect(verifyCode('a@b.co', '000000')).rejects.toMatchObject({ code: 'invalid_code' });
    expect(track).not.toHaveBeenCalled();
  });
});

describe('completeWelcome', () => {
  it('calls the RPC with the form values', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    mockClient({ rpc });
    await completeWelcome({ displayName: 'Ana', homeUnitId: null, locale: 'es-MX' });
    expect(rpc).toHaveBeenCalledWith('complete_welcome', {
      p_display_name: 'Ana',
      p_home_unit_id: null,
      p_locale: 'es-MX',
    });
  });

  it('maps failures to network or unknown', async () => {
    mockClient({
      rpc: jest.fn().mockResolvedValue({ error: { message: 'TypeError: Failed to fetch' } }),
    });
    await expect(
      completeWelcome({ displayName: 'Ana', homeUnitId: null, locale: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'network' });
    mockClient({ rpc: jest.fn().mockResolvedValue({ error: { message: 'invalid_unit' } }) });
    await expect(
      completeWelcome({ displayName: 'Ana', homeUnitId: null, locale: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'unknown' });
  });
});
