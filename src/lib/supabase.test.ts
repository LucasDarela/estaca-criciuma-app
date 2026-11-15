const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
  jest.dontMock('@supabase/supabase-js');
});

function load() {
  const createClient = jest.fn(() => ({ marker: Symbol('client') }));
  let mod!: typeof import('./supabase');
  jest.isolateModules(() => {
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    mod = jest.requireActual<typeof import('./supabase')>('./supabase');
  });
  return {
    createClient,
    getSupabase: mod.getSupabase,
    isSupabaseConfigured: mod.isSupabaseConfigured,
  };
}

describe('getSupabase', () => {
  it('throws when the URL is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'key';
    expect(() => load().getSupabase()).toThrow('Supabase is not configured');
  });

  it('throws naming the publishable key variable when it is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => load().getSupabase()).toThrow(
      'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  });

  it('creates the client with the encrypted persisted session', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'key';
    const { createClient, getSupabase } = load();
    getSupabase();
    expect(createClient).toHaveBeenCalledWith('http://localhost:54321', 'key', {
      auth: {
        storage: {
          getItem: expect.any(Function),
          setItem: expect.any(Function),
          removeItem: expect.any(Function),
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });

  it('returns the same instance on later calls', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'key';
    const { createClient, getSupabase } = load();
    expect(getSupabase()).toBe(getSupabase());
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});

describe('isSupabaseConfigured', () => {
  it('is true when both variables exist', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'key';
    expect(load().isSupabaseConfigured()).toBe(true);
  });

  it('is false without the publishable key', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(load().isSupabaseConfigured()).toBe(false);
  });

  it('is false without the URL', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'key';
    expect(load().isSupabaseConfigured()).toBe(false);
  });
});
