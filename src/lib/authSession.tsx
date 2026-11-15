import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getSupabase, isSupabaseConfigured } from './supabase';

export type AuthSession =
  | { status: 'loading' }
  // expired: SIGNED_OUT that the app did not ask for (7.6)
  | { status: 'signedOut'; expired: boolean }
  | { status: 'signedIn'; userId: string; email: string };

const AuthSessionContext = createContext<AuthSession | null>(null);

// Tells an app-requested sign out (Sair, deletion, refused consent) from an expired session.
let appInitiatedSignOut = false;

/**
 * Sign out requested by the app; it does not mark the session as `expired`.
 */
export async function signOut(): Promise<void> {
  appInitiatedSignOut = true;
  try {
    await getSupabase().auth.signOut();
  } finally {
    // The SIGNED_OUT event is delivered before signOut resolves; never leave the flag set.
    appInitiatedSignOut = false;
  }
}

/**
 * Loads the stored session, then follows `onAuthStateChange`. Without configuration the app is a
 * signed-out visitor. Refresh runs only while the app is in the foreground (Supabase RN guide).
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(
    isSupabaseConfigured() ? { status: 'loading' } : { status: 'signedOut', expired: false },
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const { auth } = getSupabase();
    let active = true;

    void auth.getSession().then(({ data }) => {
      if (!active) return;
      const current = data.session;
      setSession((previous) =>
        previous.status !== 'loading'
          ? previous
          : current
            ? { status: 'signedIn', userId: current.user.id, email: current.user.email ?? '' }
            : { status: 'signedOut', expired: false },
      );
    });

    const { data } = auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (next) {
        setSession({ status: 'signedIn', userId: next.user.id, email: next.user.email ?? '' });
      } else if (event === 'SIGNED_OUT') {
        setSession({ status: 'signedOut', expired: !appInitiatedSignOut });
      } else {
        setSession((previous) =>
          previous.status === 'loading' ? { status: 'signedOut', expired: false } : previous,
        );
      }
    });

    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void auth.startAutoRefresh();
      else void auth.stopAutoRefresh();
    });
    void auth.startAutoRefresh();

    return () => {
      active = false;
      data.subscription.unsubscribe();
      appState.remove();
      void auth.stopAutoRefresh();
    };
  }, []);

  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSession {
  const session = useContext(AuthSessionContext);
  if (!session) throw new Error('useAuthSession must be used inside AuthSessionProvider');
  return session;
}
