import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';

import { HeaderAvatarProvider } from '@/components/HeaderAvatarContext';
import { useViewer } from '@/features/viewer/ViewerProvider';

/** Feeds the signed-in person to every ScreenHeader; the avatar opens the profile (RF-13). */
export function ViewerHeaderAvatar({ children }: { children: ReactNode }) {
  const { profile } = useViewer();
  const router = useRouter();
  const value = useMemo(
    () => (profile ? { name: profile.displayName, onPress: () => router.push('/profile') } : null),
    [profile, router],
  );
  return <HeaderAvatarProvider value={value}>{children}</HeaderAvatarProvider>;
}
