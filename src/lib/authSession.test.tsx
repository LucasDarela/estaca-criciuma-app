import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthSessionProvider, signOut, useAuthSession } from './authSession';
import { getSupabase, isSupabaseConfigured } from './supabase';

jest.mock('./supabase', () => ({ getSupabase: jest.fn(), isSupabaseConfigured: jest.fn() }));

type Listener = (event: string, session: unknown) => void;

const stored = { user: { id: 'u1', email: 'ana@exemplo.org' } };
let listener: Listener;
const auth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn((cb: Listener) => {
    listener = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  }),
  signOut: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthSessionProvider>{children}</AuthSessionProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (isSupabaseConfigured as jest.Mock).mockReturnValue(true);
  (getSupabase as jest.Mock).mockReturnValue({ auth });
  auth.getSession.mockResolvedValue({ data: { session: stored } });
  // Like supabase-js: SIGNED_OUT is delivered before signOut resolves.
  auth.signOut.mockImplementation(async () => {
    listener('SIGNED_OUT', null);
    return { error: null };
  });
});

describe('AuthSessionProvider', () => {
  it('CA-02: a stored session is signed in without a new login', async () => {
    const { result } = await renderHook(() => useAuthSession(), { wrapper });
    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'signedIn',
        userId: 'u1',
        email: 'ana@exemplo.org',
      }),
    );
  });

  it('is signed out without a stored session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const { result } = await renderHook(() => useAuthSession(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ status: 'signedOut', expired: false }));
  });

  it('marks SIGNED_OUT without signOut() as expired', async () => {
    const { result } = await renderHook(() => useAuthSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    await act(async () => listener('SIGNED_OUT', null));
    expect(result.current).toEqual({ status: 'signedOut', expired: true });
  });

  it('does not mark expired after signOut()', async () => {
    const { result } = await renderHook(() => useAuthSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    await act(async () => {
      await signOut();
    });
    expect(result.current).toEqual({ status: 'signedOut', expired: false });
  });

  it('follows a new sign in', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const { result } = await renderHook(() => useAuthSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(async () => listener('SIGNED_IN', { user: { id: 'u2', email: 'bia@exemplo.org' } }));
    expect(result.current).toEqual({ status: 'signedIn', userId: 'u2', email: 'bia@exemplo.org' });
  });

  it('is signed out without configuration and never touches the client', async () => {
    (isSupabaseConfigured as jest.Mock).mockReturnValue(false);
    const { result } = await renderHook(() => useAuthSession(), { wrapper });
    expect(result.current).toEqual({ status: 'signedOut', expired: false });
    expect(getSupabase).not.toHaveBeenCalled();
  });
});
