import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UnitId } from '@/domain/units';
import { radius, size, space, stroke, theme, type, units } from '@/theme/theme';

import { Avatar } from './Avatar';
import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { pressedStyle } from './pressable';
import { Switch } from './Switch';

export type ListItemProps = {
  title: string;
  subtitle?: string;
  leading?:
    | { kind: 'avatar'; name: string }
    | { kind: 'icon'; name: IconName }
    | { kind: 'unitDot'; unitId: UnitId };
  trailing?:
    | { kind: 'chevron' }
    | { kind: 'count'; text: string }
    | { kind: 'switch'; value: boolean; onValueChange: (value: boolean) => void; label: string };
  onPress?: () => void;
};

export function ListItem({ title, subtitle, leading, trailing, onPress }: ListItemProps) {
  const content = (
    <>
      {leading?.kind === 'avatar' ? <Avatar name={leading.name} /> : null}
      {leading?.kind === 'icon' ? <Icon name={leading.name} color={theme.primary} /> : null}
      {leading?.kind === 'unitDot' ? (
        <View style={[styles.dot, { backgroundColor: units[leading.unitId].dot }]} />
      ) : null}
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing?.kind === 'chevron' ? <Icon name="chevron_right" color={theme.iconMuted} /> : null}
      {trailing?.kind === 'count' ? <Text style={styles.count}>{trailing.text}</Text> : null}
      {trailing?.kind === 'switch' ? (
        <Switch
          size="compact"
          label={trailing.label}
          value={trailing.value}
          onValueChange={trailing.onValueChange}
        />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={(state) => [styles.row, pressedStyle(state)]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.touchMinIos,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: theme.divider,
  },
  dot: { width: size.unitDot, height: size.unitDot, borderRadius: radius.pill },
  texts: { flex: 1, gap: space.xs / 2 },
  title: { ...type.listTitle, color: theme.text },
  subtitle: { ...type.caption, color: theme.textMuted },
  count: { ...type.caption, color: theme.textSubtle },
});
