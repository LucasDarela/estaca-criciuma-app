import { createContext, useContext, type ReactNode } from 'react';

export type HeaderAvatar = { name: string; onPress: () => void } | null;

const HeaderAvatarContext = createContext<HeaderAvatar>(null);

/**
 * Lets the app shell hand the signed-in person to every ScreenHeader without the design
 * system importing viewer or router code.
 */
export function HeaderAvatarProvider({
  value,
  children,
}: {
  value: HeaderAvatar;
  children: ReactNode;
}) {
  return <HeaderAvatarContext.Provider value={value}>{children}</HeaderAvatarContext.Provider>;
}

/** The header avatar, or `null` outside a provider or when nobody is signed in. */
export function useHeaderAvatar(): HeaderAvatar {
  return useContext(HeaderAvatarContext);
}
