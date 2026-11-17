import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { pressedStyle } from '@/components/pressable';
import type { MeetingItemKind } from '@/domain/meetingItems';
import { radius, size, space, theme, type } from '@/theme/theme';

export type MeetingAgendaCardProps = {
  counts: Record<MeetingItemKind, number>;
  onPress: () => void;
};

/** RF-17: opens the agenda sheet. Only rendered for `canLead` on a meeting. */
export function MeetingAgendaCard({ counts, onPress }: MeetingAgendaCardProps) {
  const { t } = useTranslation();
  const summary = [
    t('events.meeting.summary.agenda', { count: counts.agenda }),
    t('events.meeting.summary.decisions', { count: counts.decision }),
    t('events.meeting.summary.pending', { count: counts.pending }),
  ].join(' · ');
  const title = t('events.meeting.card');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${summary}`}
      onPress={onPress}
      style={(state) => [styles.card, pressedStyle(state)]}
    >
      <Icon name="checklist" size={size.icon} color={theme.onPrimary} />
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: theme.primary,
  },
  texts: { flex: 1, gap: space.xs },
  title: { ...type.listTitle, color: theme.onPrimary },
  summary: { ...type.caption, color: theme.onPrimary },
});
