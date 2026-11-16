// send-push request handling (spec push-notifications RF-10 to RF-12, RNF-03, RNF-06). Pure
// TypeScript with no imports (ADR 0006): the database, the Expo Push API, the clock and the logs
// come in as dependencies. Authorization and recipients are decided by the SQL functions.

export type PushLocale = 'pt-BR' | 'en-US' | 'es-MX';
export type SendPushRequest = { kind: 'event' | 'post'; itemId: string; audience: string[] };
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { kind: 'event' | 'post'; itemId: string };
  sound: 'default';
  channelId: 'default';
};
export type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
export type LogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  request_id: string;
  user_id?: string;
  [k: string]: string | number | undefined;
};
export type HandlerResult = { status: number; body: Record<string, unknown> };

export type SendPushDeps = {
  /** User id of a valid JWT, or null. */
  verifyUser(jwt: string): Promise<string | null>;
  pushItem(
    kind: string,
    itemId: string,
  ): Promise<{
    unitId: string;
    title: string;
    startsAt: Date | null;
    location: string | null;
    textBody: string | null;
  }>;
  prepare(input: {
    actor: string;
    kind: string;
    itemId: string;
    audience: string[];
    title: string;
    body: string;
    eventStartsAt: Date | null;
    eventLocation: string | null;
  }): Promise<{ notificationId: string; recipients: { token: string; locale: string }[] }>;
  postToExpo(
    messages: ExpoMessage[],
  ): Promise<{ ok: true; tickets: ExpoTicket[] } | { ok: false; status: number }>;
  removeDevices(tokens: string[]): Promise<void>;
  discard(notificationId: string): Promise<void>;
  /** The body builders of pushContent.ts, injected because shared modules have no imports. */
  content: {
    eventPushBody(startsAt: Date, location: string, locale: PushLocale): string;
    postPushBody(text: string): string;
  };
  log(entry: LogEntry): void;
  requestId: string;
  now(): Date;
};

const EXPO_BATCH_SIZE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALES: readonly string[] = ['pt-BR', 'en-US', 'es-MX'];

/** SQL error code (the exception message) to HTTP status. */
const SQL_ERRORS: Record<string, { status: number; error: string }> = {
  forbidden: { status: 403, error: 'forbidden' },
  rate_limited: { status: 429, error: 'rate_limited' },
  invalid_audience: { status: 400, error: 'invalid_audience' },
  unsupported_kind: { status: 400, error: 'unsupported_kind' },
  item_not_found: { status: 404, error: 'item_not_found' },
};

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseRequest(raw: unknown): SendPushRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, itemId, audience } = raw as Record<string, unknown>;
  if (kind !== 'event' && kind !== 'post') return null;
  if (typeof itemId !== 'string' || !UUID.test(itemId)) return null;
  if (
    !Array.isArray(audience) ||
    audience.length < 1 ||
    audience.length > 25 ||
    !audience.every((a) => typeof a === 'string' && a.length > 0 && a.length <= 40)
  ) {
    return null;
  }
  return { kind, itemId, audience: audience as string[] };
}

function bearer(authorization: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  return match ? match[1] : null;
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

export async function handleSendPush(
  authorization: string | null,
  rawBody: unknown,
  deps: SendPushDeps,
): Promise<HandlerResult> {
  const log = (
    level: LogEntry['level'],
    event: string,
    fields: Record<string, string | number> = {},
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

  const jwt = bearer(authorization);
  if (!jwt) return { status: 401, body: { error: 'unauthorized' } };

  let actor: string | null;
  try {
    actor = await deps.verifyUser(jwt);
  } catch {
    log('error', 'push_dispatch_failed', { code: 'internal' });
    return { status: 500, body: { error: 'internal' } };
  }
  if (!actor) return { status: 401, body: { error: 'unauthorized' } };

  const request = parseRequest(rawBody);
  if (!request) return { status: 400, body: { error: 'invalid_request' } };

  let prepared: Awaited<ReturnType<SendPushDeps['prepare']>>;
  let item: Awaited<ReturnType<SendPushDeps['pushItem']>>;
  try {
    item = await deps.pushItem(request.kind, request.itemId);
    const body = request.kind === 'post' ? deps.content.postPushBody(item.textBody ?? '') : '';
    prepared = await deps.prepare({
      actor,
      kind: request.kind,
      itemId: request.itemId,
      audience: request.audience,
      title: item.title,
      body,
      eventStartsAt: item.startsAt,
      eventLocation: item.location,
    });
  } catch (error) {
    const mapped = SQL_ERRORS[errorCode(error)];
    log(
      'warn',
      'push_dispatch_failed',
      { code: mapped ? mapped.error : 'internal', item_id: request.itemId },
      actor,
    );
    return mapped
      ? { status: mapped.status, body: { error: mapped.error } }
      : { status: 500, body: { error: 'internal' } };
  }

  const bodyFor = new Map<string, string>();
  const bodyOf = (locale: string): string => {
    const safe: PushLocale = LOCALES.includes(locale) ? (locale as PushLocale) : 'pt-BR';
    let body = bodyFor.get(safe);
    if (body === undefined) {
      body =
        request.kind === 'event' && item.startsAt
          ? deps.content.eventPushBody(item.startsAt, item.location ?? '', safe)
          : deps.content.postPushBody(item.textBody ?? '');
      bodyFor.set(safe, body);
    }
    return body;
  };
  const messages: ExpoMessage[] = prepared.recipients.map((r) => ({
    to: r.token,
    title: item.title,
    body: bodyOf(r.locale),
    data: { kind: request.kind, itemId: request.itemId },
    sound: 'default',
    channelId: 'default',
  }));

  const batches = chunk(messages, EXPO_BATCH_SIZE);
  let delivered = 0;
  let reached = 0;
  const unregistered: string[] = [];
  for (const batch of batches) {
    let result: Awaited<ReturnType<SendPushDeps['postToExpo']>>;
    try {
      result = await deps.postToExpo(batch);
    } catch {
      result = { ok: false, status: 0 };
    }
    if (!result.ok) continue;
    reached += 1;
    result.tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') delivered += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') unregistered.push(batch[index].to);
    });
  }

  try {
    if (unregistered.length > 0) {
      await deps.removeDevices(unregistered);
      log(
        'warn',
        'push_tokens_removed',
        { count: unregistered.length, item_id: request.itemId },
        actor,
      );
    }
  } catch {
    log(
      'error',
      'push_dispatch_failed',
      { code: 'remove_devices', item_id: request.itemId },
      actor,
    );
  }

  if (batches.length > 0 && reached === 0) {
    try {
      await deps.discard(prepared.notificationId);
    } catch {
      log('error', 'push_dispatch_failed', { code: 'discard', item_id: request.itemId }, actor);
    }
    log(
      'error',
      'push_dispatch_failed',
      { code: 'push_unavailable', item_id: request.itemId },
      actor,
    );
    return { status: 502, body: { error: 'push_unavailable' } };
  }

  log(
    'info',
    'push_dispatched',
    { item_id: request.itemId, recipients: prepared.recipients.length },
    actor,
  );
  return { status: 200, body: { recipients: delivered } };
}
