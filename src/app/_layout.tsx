import '@/i18n';

// Per-weight imports: the package root would bundle all ~36 font files.
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSans_500Medium } from '@expo-google-fonts/noto-sans/500Medium';
import { NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans/600SemiBold';
import { NotoSans_700Bold } from '@expo-google-fonts/noto-sans/700Bold';
import { NotoSerif_400Regular } from '@expo-google-fonts/noto-serif/400Regular';
import { NotoSerif_400Regular_Italic } from '@expo-google-fonts/noto-serif/400Regular_Italic';
import { NotoSerif_600SemiBold } from '@expo-google-fonts/noto-serif/600SemiBold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';

import { ToastProvider } from '@/components/toast/ToastProvider';
import { SessionEffects } from '@/features/auth/SessionEffects';
import { ViewerHeaderAvatar } from '@/features/navigation/ViewerHeaderAvatar';
import { ViewerProvider } from '@/features/viewer/ViewerProvider';
import { useAppStateFocus } from '@/lib/appFocus';
import { AuthSessionProvider, useAuthSession } from '@/lib/authSession';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  // Keys must match theme.fontFamily so `type.*` styles resolve.
  const [fontsLoaded, fontError] = useFonts({
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
    NotoSerif_400Regular,
    NotoSerif_400Regular_Italic,
    NotoSerif_600SemiBold,
  });
  const ready = fontsLoaded || fontError !== null;

  useAppStateFocus();

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionProvider>
        <AuthenticatedApp />
      </AuthSessionProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const auth = useAuthSession();
  const sessionKnown = auth.status !== 'loading';

  // Keep the splash up until fonts and the stored session are known (no flash of the visitor UI).
  useEffect(() => {
    if (sessionKnown) void SplashScreen.hideAsync();
  }, [sessionKnown]);

  if (!sessionKnown) return null;

  return (
    <ViewerProvider session={auth.status === 'signedIn' ? { userId: auth.userId } : null}>
      <ToastProvider>
        <SessionEffects />
        <ViewerHeaderAvatar>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </ViewerHeaderAvatar>
      </ToastProvider>
    </ViewerProvider>
  );
}
