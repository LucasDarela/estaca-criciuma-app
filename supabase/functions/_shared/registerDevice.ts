// register-device request handling (spec push-notifications RF-01, RF-03, RF-07, RNF-02, RNF-06).
// Pure TypeScript with no imports (ADR 0006).

export type LogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  request_id: string;
  user_id?: string;
  [k: string]: string | number | undefined;
};
export type HandlerResult = { status: number; body: Record<string, unknown> };
export type BearerKind = { kind: 'visitor' } | { kind: 'jwt'; jwt: string };

const TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

/**
 * No header, a token without 2 dots (the publishable key is not a JWT) or a JWT with role "anon"
 * is a visitor. Anything else is a user JWT, which the caller must verify.
 */
export function classifyBearer(authorization: string | null): BearerKind {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  if (!match) return { kind: 'visitor' };
  const token = match[1];
  const parts = token.split('.');
  if (parts.length !== 3) return { kind: 'visitor' };
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { role?: unknown };
    if (claims.role === 'anon') return { kind: 'visitor' };
  } catch {
    // Not decodable: let the caller's verification reject it.
  }
  return { kind: 'jwt', jwt: token };
}

/** The first IP of x-forwarded-for, trimmed; 'unknown' without the header. */
export function clientIp(forwardedFor: string | null): string {
  const first = (forwardedFor ?? '').split(',')[0].trim();
  return first || 'unknown';
}

export type RegisterDeviceDeps = {
  verifyUser(jwt: string): Promise<string | null>;
  register(input: {
    token: string;
    userId: string | null;
    platform: string;
    locale: string;
    ipHash: string;
  }): Promise<'registered' | 'rate_limited'>;
  /** sha256 hex of the IP. */
  hashIp(ip: string): Promise<string>;
  log(entry: LogEntry): void;
  requestId: string;
  now(): Date;
};

const SQL_INVALID = ['invalid_token', 'invalid_platform', 'invalid_locale'];

/** 200 registered, 429 rate_limited, 400 invalid_request, 401 for an invalid JWT. */
export async function handleRegisterDevice(
  authorization: string | null,
  forwardedFor: string | null,
  rawBody: unknown,
  deps: RegisterDeviceDeps,
): Promise<HandlerResult> {
  const log = (
    level: LogEntry['level'],
    event: string,
    fields: Record<string, string> = {},
    userId?: string,
  ) =>
    deps.log({
      timestamp: deps.now().toISOString(),
      level,
      event,
      request_id: deps.requestId,
      ...(userId ? { user_id: userId } : {}),
      ...fields,
    });

  const bearer = classifyBearer(authorization);
  let userId: string | null = null;
  if (bearer.kind === 'jwt') {
    try {
      userId = await deps.verifyUser(bearer.jwt);
    } catch {
      log('error', 'device_register_failed', { code: 'internal' });
      return { status: 500, body: { error: 'internal' } };
    }
    if (!userId) return { status: 401, body: { error: 'unauthorized' } };
  }

  const body =
    typeof rawBody === 'object' && rawBody !== null ? (rawBody as Record<string, unknown>) : {};
  const { token, platform, locale } = body;
  if (
    typeof token !== 'string' ||
    !TOKEN.test(token) ||
    (platform !== 'ios' && platform !== 'android') ||
    (locale !== 'pt-BR' && locale !== 'en-US' && locale !== 'es-MX')
  ) {
    return { status: 400, body: { error: 'invalid_request' } };
  }

  try {
    const ipHash = await deps.hashIp(clientIp(forwardedFor));
    const result = await deps.register({ token, userId, platform, locale, ipHash });
    if (result === 'rate_limited') {
      log('warn', 'device_register_limited', {}, userId ?? undefined);
      return { status: 429, body: { error: 'rate_limited' } };
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (SQL_INVALID.includes(code)) return { status: 400, body: { error: 'invalid_request' } };
    log('error', 'device_register_failed', { code: 'internal' }, userId ?? undefined);
    return { status: 500, body: { error: 'internal' } };
  }

  log('info', 'device_registered', { with_account: userId ? 'yes' : 'no' }, userId ?? undefined);
  return { status: 200, body: { status: 'registered' } };
}
