import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast/ToastProvider';
import { signOut, useAuthSession } from '@/lib/authSession';

import { useViewer } from '../viewer/ViewerProvider';

/**
 * UI-less effects tied to the session:
 * 1. consent (RF-10): the first time the viewer of a signed-in user is loaded, an account that
 *    never consented is signed out, unless the person is on /welcome or /sign-in* (the app may
 *    have been closed halfway through /welcome). It runs once per user id: later navigation, such
 *    as /welcome to /agenda while the viewer cache is still stale, must never trigger it;
 * 2. language: the profile's locale wins over the device language;
 * 3. an expired session shows the toast once (7.6).
 */
export function SessionEffects() {
  const { t, i18n } = useTranslation();
  const auth = useAuthSession();
  const viewer = useViewer();
  const pathname = usePathname();
  const toast = useToast();
  const toastedExpiry = useRef(false);
  const consentCheckedFor = useRef<string | null>(null);

  const onAuthRoute = pathname === '/welcome' || pathname.startsWith('/sign-in');
  const signedInUserId = auth.status === 'signedIn' ? auth.userId : null;
  const loadedForUser = viewer.loaded && viewer.userId === signedInUserId;
  const consented = Boolean(viewer.profile?.consentedAt);

  useEffect(() => {
    if (signedInUserId === null) {
      consentCheckedFor.current = null;
      return;
    }
    if (!loadedForUser || consentCheckedFor.current === signedInUserId) return;
    consentCheckedFor.current = signedInUserId;
    if (!onAuthRoute && !consented) void signOut();
  }, [signedInUserId, loadedForUser, onAuthRoute, consented]);

  const locale = viewer.profile?.locale;
  useEffect(() => {
    if (locale && locale !== i18n.language) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  const expired = auth.status === 'signedOut' && auth.expired;
  useEffect(() => {
    if (!expired) {
      toastedExpiry.current = false;
      return;
    }
    if (toastedExpiry.current) return;
    toastedExpiry.current = true;
    toast.show({ message: t('auth.sessionExpired') });
  }, [expired, toast, t]);

  return null;
}
