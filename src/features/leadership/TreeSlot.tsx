import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { pressedStyle } from '@/components/pressable';
import { callingName } from '@/domain/callings';
import type { OrgChartMember, Slot } from '@/domain/orgChart';
import { useLocale } from '@/i18n/useLocale';
import { radius, size, space, stroke, theme, type } from '@/theme/theme';

export type TreeSlotProps = {
  slot: Slot;
  size: 'large' | 'default';
  onPersonPress: (member: OrgChartMember) => void;
};

/** A fixed position (president, bishop, counselors): the people with that calling, or only its label (RF-09). */
export function TreeSlot({ slot, size: slotSize, onPersonPress }: TreeSlotProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const label = t(`leadership.slot.${slot.label}`);
  const box = slotSize === 'large' ? size.avatarLarge : size.avatar;

  if (slot.people.length === 0) {
    return (
      <View
        accessible
        accessibilityLabel={t('leadership.slot.empty', { label })}
        style={styles.card}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.emptyAvatar, { width: box, height: box }]}
        />
        <Text style={styles.label}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {slot.people.map((person) => (
        <Pressable
          key={person.memberCallId}
          accessibilityRole="button"
          accessibilityLabel={t('leadership.person.label', {
            name: person.displayName,
            calling: callingName(person.calling, locale),
          })}
          onPress={() => onPersonPress(person)}
          style={(state) => [styles.person, pressedStyle(state)]}
        >
          <Avatar name={person.displayName} size={slotSize} />
          <Text style={styles.name}>{person.displayName}</Text>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: theme.surface,
    borderWidth: stroke.hairline,
    borderColor: theme.border,
    borderRadius: radius.card,
  },
  person: {
    minHeight: size.touchMinIos,
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'stretch',
  },
  emptyAvatar: { borderRadius: radius.pill, backgroundColor: theme.surfaceDisabled },
  name: { ...type.callout, color: theme.text, textAlign: 'center' },
  label: { ...type.caption, color: theme.textMuted, textAlign: 'center' },
});
