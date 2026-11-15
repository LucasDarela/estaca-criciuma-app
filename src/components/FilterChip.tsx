import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { minTouchSlop, pressedStyle } from './pressable';

export type FilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  dotColor?: string;
  icon?: IconName;
};

export function FilterChip({ label, selected, onPress, dotColor, icon }: FilterChipProps) {
  const fg = selected ? theme.onPrimary : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={minTouchSlop(size.chip)}
      onPress={onPress}
      style={(state) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressedStyle(state),
      ]}
    >
      {dotColor ? (
        <View style={[styles.dot, { backgroundColor: selected ? theme.onPrimary : dotColor }]} />
      ) : null}
      {icon ? <Icon name={icon} size={size.iconSearch} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: size.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  selected: { backgroundColor: theme.primary },
  unselected: {
    backgroundColor: theme.surface,
    borderWidth: stroke.hairline,
    borderColor: theme.borderStrong,
  },
  dot: { width: size.unitDot, height: size.unitDot, borderRadius: radius.pill },
  label: type.listTitle,
});
