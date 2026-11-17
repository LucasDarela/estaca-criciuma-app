/**
 * Maps a Supabase RPC/PostgREST error to a short code. RPCs raise a known code in `message`;
 * a failed fetch is `network`; anything else is `unknown`.
 */
export function rpcErrorCode<C extends string>(
  error: unknown,
  known: readonly C[],
): C | 'network' | 'unknown' {
  if (error instanceof TypeError) return 'network';
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const match = known.find((code) => code === message);
  if (match !== undefined) return match;
  return /fetch|network/i.test(message) ? 'network' : 'unknown';
}
