import { eventPushBody, postPushBody } from './pushContent';
import {
  chunk,
  handleSendPush,
  type ExpoMessage,
  type ExpoTicket,
  type LogEntry,
  type SendPushDeps,
} from './sendPush';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const SECRET_EMAIL = 'pessoa.secreta@exemplo.org';
const SECRET_NAME = 'Fulana Secreta';

const token = (n: number) => `ExponentPushToken[token${String(n).padStart(8, '0')}]`;

function makeDeps(
  overrides: Partial<SendPushDeps> = {},
  recipients = [{ token: token(1), locale: 'pt-BR' }],
) {
  const logs: LogEntry[] = [];
  const posted: ExpoMessage[][] = [];
  const deps: SendPushDeps = {
    verifyUser: jest.fn(async () => ACTOR),
    pushItem: jest.fn(async () => ({
      unitId: 'ramoGaivota',
      title: 'Batismo',
      startsAt: new Date('2026-11-21T18:00:00Z'),
      location: 'Capela do Ramo Gaivota',
      textBody: null,
    })),
    prepare: jest.fn(async () => ({ notificationId: 'n1', recipients })),
    postToExpo: jest.fn(async (messages: ExpoMessage[]) => {
      posted.push(messages);
      const tickets: ExpoTicket[] = messages.map((_, i) => ({ status: 'ok', id: `t${i}` }));
      return { ok: true as const, tickets };
    }),
    removeDevices: jest.fn(async () => undefined),
    discard: jest.fn(async () => undefined),
    content: { eventPushBody, postPushBody },
    log: (entry) => logs.push(entry),
    requestId: 'req-1',
    now: () => new Date('2026-11-15T12:00:00Z'),
    ...overrides,
  };
  return { deps, logs, posted };
}

const body = { kind: 'event', itemId: ITEM_ID, audience: ['all'] };
const auth = 'Bearer user.jwt.token';

function expectCleanLogs(logs: LogEntry[], secrets: string[]) {
  for (const entry of logs) {
    const json = JSON.stringify(entry);
    for (const secret of [...secrets, 'ExponentPushToken', SECRET_EMAIL, SECRET_NAME]) {
      expect(json).not.toContain(secret);
    }
    expect(entry.timestamp).toEqual(expect.any(String));
    expect(['info', 'warn', 'error']).toContain(entry.level);
    expect(entry.event).toEqual(expect.any(String));
    expect(entry.request_id).toBe('req-1');
  }
}

describe('handleSendPush', () => {
  it('CA-11: builds title, body in the language of each device and the data', async () => {
    const { deps, posted } = makeDeps({}, [
      { token: token(1), locale: 'pt-BR' },
      { token: token(2), locale: 'en-US' },
    ]);
    const result = await handleSendPush(auth, body, deps);
    expect(result).toEqual({ status: 200, body: { recipients: 2 } });
    expect(posted[0]).toEqual([
      {
        to: token(1),
        title: 'Batismo',
        body: 'Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota',
        data: { kind: 'event', itemId: ITEM_ID },
        sound: 'default',
        channelId: 'default',
      },
      {
        to: token(2),
        title: 'Batismo',
        body: 'Saturday, November 21 · 15:00 · Capela do Ramo Gaivota',
        data: { kind: 'event', itemId: ITEM_ID },
        sound: 'default',
        channelId: 'default',
      },
    ]);
  });

  it('an unknown device locale falls back to pt-BR', async () => {
    const { deps, posted } = makeDeps({}, [{ token: token(1), locale: 'fr-FR' }]);
    await handleSendPush(auth, body, deps);
    expect(posted[0][0].body).toMatch(/^Sábado/);
  });

  it('stores an empty body for an event and the first line for a post', async () => {
    const event = makeDeps();
    await handleSendPush(auth, body, event.deps);
    expect(event.deps.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        title: 'Batismo',
        body: '',
        eventLocation: 'Capela do Ramo Gaivota',
        audience: ['all'],
      }),
    );

    const post = makeDeps({
      pushItem: jest.fn(async () => ({
        unitId: 'icara',
        title: 'Aviso',
        startsAt: null,
        location: null,
        textBody: '  Primeira linha\nsegunda',
      })),
    });
    const result = await handleSendPush(auth, { ...body, kind: 'post' }, post.deps);
    expect(post.deps.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Primeira linha' }),
    );
    expect(post.posted[0][0]).toEqual(
      expect.objectContaining({
        title: 'Aviso',
        body: 'Primeira linha',
        data: { kind: 'post', itemId: ITEM_ID },
      }),
    );
    expect(result.status).toBe(200);
  });

  it('250 recipients go out in batches of 100, 100 and 50', async () => {
    const recipients = Array.from({ length: 250 }, (_, i) => ({
      token: token(i),
      locale: 'pt-BR',
    }));
    const { deps, posted } = makeDeps({}, recipients);
    const result = await handleSendPush(auth, body, deps);
    expect(posted.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(result.body).toEqual({ recipients: 250 });
  });

  it('chunk splits and keeps order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('CA-12: forbidden from the database is a 403', async () => {
    const { deps, logs } = makeDeps({
      prepare: jest.fn(async () => {
        throw new Error('forbidden');
      }),
    });
    expect(await handleSendPush(auth, body, deps)).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(deps.postToExpo).not.toHaveBeenCalled();
    expect(logs.some((l) => l.event === 'push_dispatch_failed' && l.code === 'forbidden')).toBe(
      true,
    );
  });

  it('CA-13: rate_limited from the database is a 429', async () => {
    const { deps } = makeDeps({
      prepare: jest.fn(async () => {
        throw new Error('rate_limited');
      }),
    });
    expect(await handleSendPush(auth, body, deps)).toEqual({
      status: 429,
      body: { error: 'rate_limited' },
    });
  });

  it.each([
    ['invalid_audience', 400],
    ['unsupported_kind', 400],
    ['item_not_found', 404],
    ['something else', 500],
  ])('maps the database error %s to %i', async (code, status) => {
    const { deps } = makeDeps({
      pushItem: jest.fn(async () => {
        throw new Error(code);
      }),
    });
    expect((await handleSendPush(auth, body, deps)).status).toBe(status);
  });

  it('CA-14: removes a token the Expo Push API reports as DeviceNotRegistered', async () => {
    const { deps } = makeDeps(
      {
        postToExpo: jest.fn(async () => ({
          ok: true as const,
          tickets: [
            { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
            { status: 'ok', id: 'a' },
          ] as ExpoTicket[],
        })),
      },
      [
        { token: 'ExponentPushToken[x0000000000]', locale: 'pt-BR' },
        { token: token(2), locale: 'pt-BR' },
      ],
    );
    const result = await handleSendPush(auth, body, deps);
    expect(deps.removeDevices).toHaveBeenCalledWith(['ExponentPushToken[x0000000000]']);
    expect(result).toEqual({ status: 200, body: { recipients: 1 } });
  });

  it('CA-23: when every batch fails it discards the notification and answers 502', async () => {
    const { deps, logs } = makeDeps({
      postToExpo: jest.fn(async () => ({ ok: false as const, status: 503 })),
    });
    const result = await handleSendPush(auth, body, deps);
    expect(result).toEqual({ status: 502, body: { error: 'push_unavailable' } });
    expect(deps.discard).toHaveBeenCalledWith('n1');
    expect(
      logs.some((l) => l.event === 'push_dispatch_failed' && l.code === 'push_unavailable'),
    ).toBe(true);
  });

  it('CA-23: a network error counts as a failed batch', async () => {
    const { deps } = makeDeps({
      postToExpo: jest.fn(async () => {
        throw new Error('network');
      }),
    });
    expect((await handleSendPush(auth, body, deps)).status).toBe(502);
  });

  it('a partial success answers 200 with the count of ok tickets and keeps the notification', async () => {
    const recipients = Array.from({ length: 150 }, (_, i) => ({
      token: token(i),
      locale: 'pt-BR',
    }));
    let call = 0;
    const { deps } = makeDeps(
      {
        postToExpo: jest.fn(async (messages: ExpoMessage[]) => {
          call += 1;
          if (call === 2) return { ok: false as const, status: 500 };
          return {
            ok: true as const,
            tickets: messages.map(() => ({ status: 'ok', id: 'x' }) as ExpoTicket),
          };
        }),
      },
      recipients,
    );
    const result = await handleSendPush(auth, body, deps);
    expect(result).toEqual({ status: 200, body: { recipients: 100 } });
    expect(deps.discard).not.toHaveBeenCalled();
  });

  it('no recipients is a 200 with zero and no call to Expo', async () => {
    const { deps } = makeDeps({}, []);
    expect(await handleSendPush(auth, body, deps)).toEqual({
      status: 200,
      body: { recipients: 0 },
    });
    expect(deps.postToExpo).not.toHaveBeenCalled();
    expect(deps.discard).not.toHaveBeenCalled();
  });

  it('answers 401 without a JWT, with a malformed header or with an invalid JWT', async () => {
    const { deps } = makeDeps();
    expect((await handleSendPush(null, body, deps)).status).toBe(401);
    expect((await handleSendPush('Basic abc', body, deps)).status).toBe(401);
    const invalid = makeDeps({ verifyUser: jest.fn(async () => null) });
    expect((await handleSendPush(auth, body, invalid.deps)).status).toBe(401);
    expect(deps.prepare).not.toHaveBeenCalled();
  });

  it('answers 500 when the JWT verification itself fails', async () => {
    const { deps } = makeDeps({
      verifyUser: jest.fn(async () => {
        throw new Error('auth down');
      }),
    });
    expect((await handleSendPush(auth, body, deps)).status).toBe(500);
  });

  it.each([
    ['not an object', 'x'],
    ['unknown kind', { ...body, kind: 'note' }],
    ['bad item id', { ...body, itemId: 'nope' }],
    ['empty audience', { ...body, audience: [] }],
    ['audience not strings', { ...body, audience: [1] }],
    ['audience too long', { ...body, audience: Array.from({ length: 26 }, () => 'all') }],
  ])('answers 400 for %s', async (_name, raw) => {
    const { deps } = makeDeps();
    expect(await handleSendPush(auth, raw, deps)).toEqual({
      status: 400,
      body: { error: 'invalid_request' },
    });
    expect(deps.prepare).not.toHaveBeenCalled();
  });

  it('CA-22: logs carry the required fields and never a token, e-mail or name', async () => {
    const scenarios: Partial<SendPushDeps>[] = [
      {},
      {
        prepare: jest.fn(async () => {
          throw new Error(`forbidden ${SECRET_EMAIL}`);
        }),
      },
      {
        prepare: jest.fn(async () => {
          throw new Error(`boom ${SECRET_NAME}`);
        }),
      },
      { postToExpo: jest.fn(async () => ({ ok: false as const, status: 500 })) },
      {
        postToExpo: jest.fn(async () => ({
          ok: true as const,
          tickets: [
            { status: 'error', message: token(1), details: { error: 'DeviceNotRegistered' } },
          ] as ExpoTicket[],
        })),
      },
      {
        verifyUser: jest.fn(async () => {
          throw new Error(SECRET_EMAIL);
        }),
      },
    ];
    for (const overrides of scenarios) {
      const { deps, logs } = makeDeps(overrides);
      await handleSendPush(auth, body, deps);
      expect(logs.length).toBeGreaterThan(0);
      expectCleanLogs(logs, [token(1), 'user.jwt.token']);
    }
  });

  it('CA-22: a successful send logs push_dispatched with the item and the total', async () => {
    const { deps, logs } = makeDeps();
    await handleSendPush(auth, body, deps);
    expect(logs).toEqual([
      expect.objectContaining({
        event: 'push_dispatched',
        level: 'info',
        item_id: ITEM_ID,
        recipients: 1,
        user_id: ACTOR,
      }),
    ]);
  });
});
