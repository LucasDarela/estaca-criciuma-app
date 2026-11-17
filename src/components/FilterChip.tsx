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
  /** Smaller chip (`size.typeChip`), used by dense filter rows. */
  compact?: boolean;
  /** `radio` for a single choice inside a labelled `ChipGroup` (RNF-07). */
  role?: 'button' | 'radio';
};

export function FilterChip({
  label,
  selected,
  onPress,
  dotColor,
  icon,
  compact = false,
  role = 'button',
}: FilterChipProps) {
  const height = compact ? size.typeChip : size.chip;
  const fg = selected ? theme.onPrimary : theme.text;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'radio' ? { checked: selected } : { selected }}
      hitSlop={minTouchSlop(height)}
      onPress={onPress}
      style={(state) => [
        styles.chip,
        { height },
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
