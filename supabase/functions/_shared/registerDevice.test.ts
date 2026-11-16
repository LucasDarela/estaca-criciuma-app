import {
  classifyBearer,
  clientIp,
  handleRegisterDevice,
  type LogEntry,
  type RegisterDeviceDeps,
} from './registerDevice';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const USER = '33333333-3333-4333-8333-333333333333';

function jwtWithRole(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.signature`;
}

function makeDeps(overrides: Partial<RegisterDeviceDeps> = {}) {
  const logs: LogEntry[] = [];
  const deps: RegisterDeviceDeps = {
    verifyUser: jest.fn(async () => USER),
    register: jest.fn(async () => 'registered' as const),
    hashIp: jest.fn(async (ip: string) => `hash-of-${ip}`),
    log: (entry) => logs.push(entry),
    requestId: 'req-2',
    now: () => new Date('2026-11-15T12:00:00Z'),
    ...overrides,
  };
  return { deps, logs };
}

const body = { token: TOKEN, platform: 'ios', locale: 'pt-BR' };

describe('classifyBearer', () => {
  it('no header, a publishable key and an anon JWT are visitors', () => {
    expect(classifyBearer(null)).toEqual({ kind: 'visitor' });
    expect(classifyBearer('Bearer sb_publishable_x')).toEqual({ kind: 'visitor' });
    expect(classifyBearer(`Bearer ${jwtWithRole('anon')}`)).toEqual({ kind: 'visitor' });
  });

  it('an authenticated JWT is a jwt', () => {
    const jwt = jwtWithRole('authenticated');
    expect(classifyBearer(`Bearer ${jwt}`)).toEqual({ kind: 'jwt', jwt });
  });

  it('a JWT that cannot be decoded is still a jwt, for the caller to reject', () => {
    expect(classifyBearer('Bearer a.!!!.c')).toEqual({ kind: 'jwt', jwt: 'a.!!!.c' });
  });
});

describe('clientIp', () => {
  it('takes the first address, trimmed', () => {
    expect(clientIp('1.2.3.4, 10.0.0.1')).toBe('1.2.3.4');
    expect(clientIp(' 5.6.7.8 ')).toBe('5.6.7.8');
  });

  it('is unknown without the header', () => {
    expect(clientIp(null)).toBe('unknown');
    expect(clientIp('')).toBe('unknown');
  });
});

describe('handleRegisterDevice', () => {
  it('CA-02: a visitor registers without a user id and hashes the first IP', async () => {
    const { deps, logs } = makeDeps();
    const result = await handleRegisterDevice(null, '1.2.3.4, 9.9.9.9', body, deps);
    expect(result).toEqual({ status: 200, body: { status: 'registered' } });
    expect(deps.register).toHaveBeenCalledWith({
      token: TOKEN,
      userId: null,
      platform: 'ios',
      locale: 'pt-BR',
      ipHash: 'hash-of-1.2.3.4',
    });
    expect(deps.verifyUser).not.toHaveBeenCalled();
    expect(logs[0]).toEqual(
      expect.objectContaining({ event: 'device_registered', with_account: 'no' }),
    );
  });

  it('CA-03: a signed-in device registers with the verified user id', async () => {
    const { deps, logs } = makeDeps();
    const jwt = jwtWithRole('authenticated');
    await handleRegisterDevice(`Bearer ${jwt}`, '1.2.3.4', body, deps);
    expect(deps.verifyUser).toHaveBeenCalledWith(jwt);
    expect(deps.register).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }));
    expect(logs[0]).toEqual(expect.objectContaining({ with_account: 'yes', user_id: USER }));
  });

  it('answers 401 for a JWT that does not verify', async () => {
    const { deps } = makeDeps({ verifyUser: jest.fn(async () => null) });
    const result = await handleRegisterDevice(
      `Bearer ${jwtWithRole('authenticated')}`,
      null,
      body,
      deps,
    );
    expect(result.status).toBe(401);
    expect(deps.register).not.toHaveBeenCalled();
  });

  it('CA-04: rate_limited from the database is a 429', async () => {
    const { deps } = makeDeps({ register: jest.fn(async () => 'rate_limited' as const) });
    expect(await handleRegisterDevice(null, '1.2.3.4', body, deps)).toEqual({
      status: 429,
      body: { error: 'rate_limited' },
    });
  });

  it.each([
    ['no body', undefined],
    ['bad token', { ...body, token: 'nope' }],
    ['bad platform', { ...body, platform: 'web' }],
    ['bad locale', { ...body, locale: 'fr-FR' }],
  ])('answers 400 for %s', async (_name, raw) => {
    const { deps } = makeDeps();
    expect(await handleRegisterDevice(null, null, raw, deps)).toEqual({
      status: 400,
      body: { error: 'invalid_request' },
    });
    expect(deps.register).not.toHaveBeenCalled();
  });

  it('a validation error from the database is a 400 and any other error a 500', async () => {
    const invalid = makeDeps({
      register: jest.fn(async () => {
        throw new Error('invalid_token');
      }),
    });
    expect((await handleRegisterDevice(null, null, body, invalid.deps)).status).toBe(400);
    const broken = makeDeps({
      register: jest.fn(async () => {
        throw new Error('db down');
      }),
    });
    expect((await handleRegisterDevice(null, null, body, broken.deps)).status).toBe(500);
  });

  it('answers 500 when the JWT verification itself fails', async () => {
    const { deps } = makeDeps({
      verifyUser: jest.fn(async () => {
        throw new Error('auth down');
      }),
    });
    expect(
      (await handleRegisterDevice(`Bearer ${jwtWithRole('authenticated')}`, null, body, deps))
        .status,
    ).toBe(500);
  });

  it('CA-22: logs carry the required fields and never the token, IP or JWT', async () => {
    const scenarios: Partial<RegisterDeviceDeps>[] = [
      {},
      { register: jest.fn(async () => 'rate_limited' as const) },
      {
        register: jest.fn(async () => {
          throw new Error(`${TOKEN} down`);
        }),
      },
      {
        verifyUser: jest.fn(async () => {
          throw new Error('pessoa@exemplo.org');
        }),
      },
    ];
    for (const overrides of scenarios) {
      const { deps, logs } = makeDeps(overrides);
      await handleRegisterDevice(`Bearer ${jwtWithRole('authenticated')}`, '1.2.3.4', body, deps);
      expect(logs.length).toBeGreaterThan(0);
      for (const entry of logs) {
        const json = JSON.stringify(entry);
        for (const secret of [
          'ExponentPushToken',
          '1.2.3.4',
          'hash-of',
          'signature',
          'pessoa@exemplo.org',
        ]) {
          expect(json).not.toContain(secret);
        }
        expect(entry).toEqual(
          expect.objectContaining({
            timestamp: expect.any(String),
            level: expect.stringMatching(/^(info|warn|error)$/),
            event: expect.any(String),
            request_id: 'req-2',
          }),
        );
      }
    }
  });
});
