import { useRouter, usePathname } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { TabBar } from '@/components/TabBar';
import { useToastBottomOffset } from '@/components/toast/ToastProvider';
import { allTabRoutes, tabsFor, type TabRoute } from '@/domain/tabs';
import { useViewer } from '@/features/viewer/ViewerProvider';
import { size } from '@/theme/theme';

function isTabRoute(value: string): value is TabRoute {
  return (allTabRoutes as readonly string[]).includes(value);
}

function ViewerTabBar({ state }: BottomTabBarProps) {
  const { kind } = useViewer();
  const { t } = useTranslation();
  const router = useRouter();
  const tabs = tabsFor(kind).map((tab) => ({
    route: tab.route,
    icon: tab.icon,
    label: t(tab.labelKey),
  }));
  const current = state.routes[state.index]?.name ?? '';
  const activeRoute = tabs.find((tab) => tab.route === current)?.route ?? null;

  return (
    <TabBar
      tabs={tabs}
      activeRoute={activeRoute}
      onSelect={(route) => router.navigate(`/${route}`)}
    />
  );
}

/**
 * Every route is a real screen and the custom ViewerTabBar decides which ones show up as tabs.
 * `href: null` is not used: expo-router 58 turns it into `hidden`, which redirects away from the
 * screen when it is focused, and a leader must still be able to open /profile (RF-19).
 */
export function TabsLayout() {
  const { kind } = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const previousKind = useRef(kind);
  const visible = tabsFor(kind).map((tab) => tab.route);

  useToastBottomOffset(size.tabBar);

  // RF-19: only a change of profile moves the person away from a tab that just disappeared.
  // Opening /profile as a leader (via the avatar) is not a change, so it stays.
  useEffect(() => {
    if (previousKind.current === kind) return;
    previousKind.current = kind;
    const current = pathname.replace(/^\//, '');
    if (isTabRoute(current) && !visible.includes(current)) router.replace('/agenda');
  }, [kind, pathname, router, visible]);

  return (
    <Tabs tabBar={(props) => <ViewerTabBar {...props} />} screenOptions={{ headerShown: false }}>
      {allTabRoutes.map((route) => (
        <Tabs.Screen key={route} name={route} />
      ))}
    </Tabs>
  );
}
