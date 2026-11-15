import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { normalizeEmail } from '@/domain/email';
import type { Locale } from '@/domain/profile';
import type { UnitId } from '@/domain/units';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

export type AuthErrorCode = 'invalid_code' | 'rate_limited' | 'network' | 'unknown';

export class AuthFlowError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthFlowError';
  }
}

const rateLimitCodes = ['over_email_send_rate_limit', 'over_request_rate_limit'];

/**
 * Maps a Supabase/network failure to a code the screens translate. Never carries the e-mail,
 * code or server message (RNF-04). 429 or an over_*_rate_limit code is `rate_limited`; otp_expired,
 * invalid_credentials or 400/401/403 is `invalid_code`; a retryable fetch error or a fetch
 * TypeError is `network`.
 */
export function toAuthFlowError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error;
  if (error instanceof AuthRetryableFetchError || error instanceof TypeError) {
    return new AuthFlowError('network');
  }
  if (error instanceof AuthApiError) {
    if (error.status === 429 || rateLimitCodes.includes(error.code ?? '')) {
      return new AuthFlowError('rate_limited');
    }
    if (
      error.code === 'otp_expired' ||
      error.code === 'invalid_credentials' ||
      [400, 401, 403].includes(error.status)
    ) {
      return new AuthFlowError('invalid_code');
    }
  }
  return new AuthFlowError('unknown');
}

/** RNF-02: the same call and response for known and unknown e-mails (`shouldCreateUser`). */
export async function requestCode(email: string): Promise<void> {
  const { error } = await getSupabase()
    .auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: true },
    })
    .catch((thrown: unknown) => ({ error: thrown }));
  if (error) throw toAuthFlowError(error);
}

/**
 * Verifies the 6-digit code, then reads whether the person already consented (RF-07).
 * A failure to read the profile is thrown: guessing `consented` could skip or repeat the consent.
 */
export async function verifyCode(email: string, token: string): Promise<{ consented: boolean }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth
    .verifyOtp({ email: normalizeEmail(email), token: token.trim(), type: 'email' })
    .catch((thrown: unknown) => ({ data: null, error: thrown }));
  if (error || !data?.user) throw toAuthFlowError(error ?? new Error('no user'));

  const profile = await supabase
    .from('profiles')
    .select('consented_at')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profile.error) throw toAuthFlowError(profile.error);

  track('user_signed_in', { method: 'email_otp' });
  return { consented: profile.data?.consented_at != null };
}

export async function completeWelcome(input: {
  displayName: string;
  homeUnitId: UnitId | null;
  locale: Locale;
}): Promise<void> {
  const { error } = await getSupabase().rpc('complete_welcome', {
    p_display_name: input.displayName,
    // The generated type is `string`, but the SQL function accepts null (no unit informed).
    p_home_unit_id: input.homeUnitId as string,
    p_locale: input.locale,
  });
  if (error) {
    // PostgREST reports a failed fetch as a plain error whose message mentions the network.
    throw new AuthFlowError(/fetch|network/i.test(error.message) ? 'network' : 'unknown');
  }
}
