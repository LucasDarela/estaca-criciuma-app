import { Pressable, StyleSheet, Text, View } from 'react-native';

import { elevation, radius, size, space, theme, type } from '@/theme/theme';

import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { pressedStyle } from './pressable';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  count?: number;
};

export type SegmentedProps<T extends string> = {
  options:
    | readonly [SegmentedOption<T>, SegmentedOption<T>]
    | readonly [SegmentedOption<T>, SegmentedOption<T>, SegmentedOption<T>];
  value: T;
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View accessibilityRole="tablist" style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        const fg = selected ? theme.text : theme.textMuted;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={
              option.count === undefined ? option.label : `${option.label}, ${option.count}`
            }
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={(state) => [styles.option, selected && styles.thumb, pressedStyle(state)]}
          >
            {option.icon ? <Icon name={option.icon} size={size.iconSearch} color={fg} /> : null}
            <Text style={[styles.label, { color: fg }]}>{option.label}</Text>
            {option.count !== undefined ? (
              <Text style={[styles.count, { color: theme.textSubtle }]}>{option.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Design asks for 3 px padding; the nearest spacing token is used.
  track: {
    flexDirection: 'row',
    padding: space.xs,
    borderRadius: radius.input,
    backgroundColor: theme.surfaceDisabled,
  },
  option: {
    flex: 1,
    minHeight: size.segmented,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.segmentedThumb,
  },
  thumb: { backgroundColor: theme.surface, ...elevation[1] },
  label: type.listTitle,
  count: type.caption,
});
