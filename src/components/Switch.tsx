import { Pressable, StyleSheet, View } from 'react-native';

import { radius, size, space, theme } from '@/theme/theme';

import { minTouchSlop, pressedStyle } from './pressable';

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  size?: 'default' | 'compact';
  disabled?: boolean;
};

// Thumb inset inside the track.
const inset = space.xs / 2;

/** Own implementation instead of the native Switch, to follow the design's colors and sizes. */
export function Switch({
  value,
  onValueChange,
  label,
  size: switchSize = 'default',
  disabled = false,
}: SwitchProps) {
  const compact = switchSize === 'compact';
  const width = compact ? size.switchWidthCompact : size.switchWidth;
  const height = compact ? size.switchHeightCompact : size.switchHeight;
  const thumb = height - inset * 2;
  const trackColor = disabled ? theme.surfaceDisabled : value ? theme.primary : theme.borderStrong;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={minTouchSlop(height)}
      onPress={() => onValueChange(!value)}
      style={(state) => [
        styles.track,
        { width, height, backgroundColor: trackColor, padding: inset },
        pressedStyle(state),
      ]}
    >
      <View
        style={{
          width: thumb,
          height: thumb,
          borderRadius: radius.pill,
          backgroundColor: disabled ? theme.textDisabled : theme.surface,
          marginLeft: value ? width - height : 0,
        }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.pill, justifyContent: 'center' },
});
