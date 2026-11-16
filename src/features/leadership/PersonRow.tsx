import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/icons/Icon';
import { pressedStyle } from '@/components/pressable';
import { callingName } from '@/domain/callings';
import type { OrgChartMember } from '@/domain/orgChart';
import { useLocale } from '@/i18n/useLocale';
import { size, space, stroke, theme, type } from '@/theme/theme';

export type PersonRowProps = {
  member: OrgChartMember;
  onPress: (member: OrgChartMember) => void;
  /** Overrides the visible name (e.g. "Ana (Sumo Conselheiro)"). */
  title?: string;
  /** Shows the calling name under the person's name. */
  showCalling?: boolean;
  /** Editing mode: an edit icon on the right (RF-24). */
  onEdit?: (member: OrgChartMember) => void;
};

/** A person in a column or list: announced as "{name}, {calling}" (RNF-09). */
export function PersonRow({ member, onPress, title, showCalling = false, onEdit }: PersonRowProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const calling = callingName(member.calling, locale);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('leadership.person.label', { name: member.displayName, calling })}
        onPress={() => onPress(member)}
        style={(state) => [styles.main, pressedStyle(state)]}
      >
        <Avatar name={member.displayName} size="small" />
        <View style={styles.texts}>
          <Text style={styles.name}>{title ?? member.displayName}</Text>
          {showCalling ? <Text style={styles.calling}>{calling}</Text> : null}
        </View>
      </Pressable>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('leadership.edit.personLabel', { name: member.displayName })}
          onPress={() => onEdit(member)}
          style={(state) => [styles.edit, pressedStyle(state)]}
        >
          <Icon name="edit" color={theme.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: stroke.hairline,
    borderBottomColor: theme.divider,
  },
  main: {
    flex: 1,
    minHeight: size.touchMinIos,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  texts: { flex: 1 },
  name: { ...type.listTitle, color: theme.text },
  calling: { ...type.caption, color: theme.textMuted },
  edit: {
    width: size.touchMinIos,
    height: size.touchMinIos,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
