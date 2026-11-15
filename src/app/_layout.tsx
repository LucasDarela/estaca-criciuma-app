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
import { ViewerHeaderAvatar } from '@/features/navigation/ViewerHeaderAvatar';
import { ViewerProvider } from '@/features/viewer/ViewerProvider';

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

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      {/* auth-account replaces null with the Supabase session. */}
      <ViewerProvider session={null}>
        <ToastProvider>
          <ViewerHeaderAvatar>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </ViewerHeaderAvatar>
        </ToastProvider>
      </ViewerProvider>
    </QueryClientProvider>
  );
}
