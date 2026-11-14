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
  let getSupabase!: () => unknown;
  jest.isolateModules(() => {
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    getSupabase = jest.requireActual<typeof import('./supabase')>('./supabase').getSupabase;
  });
  return { createClient, getSupabase };
}

describe('getSupabase', () => {
  it('throws when the URL is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    expect(() => load().getSupabase()).toThrow('Supabase is not configured');
  });

  it('throws when the anon key is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => load().getSupabase()).toThrow('Supabase is not configured');
  });

  it('creates the client without session persistence', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const { createClient, getSupabase } = load();
    getSupabase();
    expect(createClient).toHaveBeenCalledWith('http://localhost:54321', 'anon', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('returns the same instance on later calls', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    const { createClient, getSupabase } = load();
    expect(getSupabase()).toBe(getSupabase());
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
