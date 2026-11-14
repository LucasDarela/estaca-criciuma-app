import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UnitId } from '@/domain/units';
import { radius, size, space, stroke, theme, type, units } from '@/theme/theme';

import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { pressedStyle } from './pressable';
import { UnitTag } from './UnitTag';

export type EventCardProps = {
  title: string;
  timeLabel: string;
  unitId: UnitId;
  onPress: () => void;
  typeIcon?: IconName;
  place?: string;
};

export function EventCard({ title, timeLabel, unitId, onPress, typeIcon, place }: EventCardProps) {
  const label = [timeLabel, title, place, units[unitId].label].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [styles.card, pressedStyle(state)]}
    >
      <View style={[styles.bar, { backgroundColor: units[unitId].dot }]} />
      <View style={styles.body}>
        <View style={styles.timeRow}>
          {typeIcon ? <Icon name={typeIcon} size={size.iconSearch} color={theme.primary} /> : null}
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {place ? (
          <View style={styles.placeRow}>
            <Icon name="location_on" size={size.iconSearch} color={theme.textMuted} />
            <Text style={styles.place}>{place}</Text>
          </View>
        ) : null}
        <UnitTag unitId={unitId} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: stroke.hairline,
    borderColor: theme.border,
    borderRadius: radius.card,
    backgroundColor: theme.surface,
  },
  bar: { width: size.eventCardBar },
  // Design asks for 14 px padding; the nearest spacing token is used.
  body: { flex: 1, padding: space.lg, gap: space.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  time: { ...type.fieldLabel, color: theme.primary },
  title: { ...type.cardTitle, color: theme.text },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  place: { ...type.caption, color: theme.textMuted, flexShrink: 1 },
});
