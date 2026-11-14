import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, maxFontScale, size, space, stroke, theme, type } from '@/theme/theme';

import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { pressedStyle } from './pressable';

export type TabItem<R extends string> = { route: R; icon: IconName; label: string };

export type TabBarProps<R extends string> = {
  tabs: readonly TabItem<R>[];
  activeRoute: R | null;
  onSelect: (route: R) => void;
};

export function TabBar<R extends string>({ tabs, activeRoute, onSelect }: TabBarProps<R>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { minHeight: size.tabBar, paddingBottom: insets.bottom }]}
    >
      {tabs.map((tab) => {
        const active = tab.route === activeRoute;
        const color = active ? theme.primary : theme.textSubtle;
        return (
          <Pressable
            key={tab.route}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(tab.route)}
            style={(state) => [styles.item, pressedStyle(state)]}
          >
            <Icon name={tab.icon} filled={active} size={size.tabBarIcon} color={color} />
            <Text
              maxFontSizeMultiplier={maxFontScale.tabLabel}
              numberOfLines={1}
              style={[type.tabLabel, { color }, active && { fontFamily: fontFamily.sansBold }]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderTopWidth: stroke.hairline,
    borderTopColor: theme.border,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingTop: space.sm,
  },
});
