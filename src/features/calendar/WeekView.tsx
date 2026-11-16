import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { dayPart, eventsOnDate, weekOf, type CalendarEvent } from '@/domain/calendar';
import { eventTypeIcon } from '@/domain/eventTypes';
import { sameDate, type CivilDate } from '@/domain/time';
import { radius, space, theme, type } from '@/theme/theme';

import { DayStrip } from './DayCell';
import { dayLabel, eventTimeLabel } from './labels';

export type WeekViewProps = {
  selected: CivilDate;
  today: CivilDate;
  /** Events already filtered by unit, type and search. */
  events: readonly CalendarEvent[];
  locale: string;
  onSelect: (date: CivilDate) => void;
  onOpenEvent: (id: string) => void;
};

/** Week strip plus one group per day that has events (RF-09). */
export function WeekView({
  selected,
  today,
  events,
  locale,
  onSelect,
  onOpenEvent,
}: WeekViewProps) {
  const { t } = useTranslation();
  const days = weekOf(selected);
  const groups = days
    .map((date) => ({ date, events: eventsOnDate(events, date) }))
    .filter((group) => group.events.length > 0);

  return (
    <View style={styles.root}>
      <View style={styles.strip}>
        <DayStrip
          days={days}
          selected={selected}
          today={today}
          locale={locale}
          events={events}
          onSelect={onSelect}
        />
      </View>
      <View style={styles.list}>
        {groups.length === 0 ? (
          <EmptyState message={t('calendar.empty.week')} />
        ) : (
          groups.map((group) => (
            <View key={`${group.date.month}-${group.date.day}`} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text accessibilityRole="header" style={styles.groupTitle}>
                  {dayLabel(group.date, locale)}
                </Text>
                {sameDate(group.date, today) ? (
                  <Text style={styles.todayTag}>{t('calendar.todayTag')}</Text>
                ) : null}
              </View>
              {group.events.map((event) => (
                <EventCard
                  key={event.id}
                  title={event.title}
                  timeLabel={eventTimeLabel(event, dayPart(event, group.date), t)}
                  unitId={event.unitId}
                  typeIcon={eventTypeIcon[event.type]}
                  place={event.location || undefined}
                  onPress={() => onOpenEvent(event.id)}
                />
              ))}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  strip: { paddingHorizontal: space.lg, paddingTop: space.sm },
  list: { gap: space.xl, paddingHorizontal: space.lg, paddingBottom: space.xl },
  group: { gap: space.md },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupTitle: { ...type.callout, color: theme.heading },
  todayTag: {
    ...type.tag,
    color: theme.primary,
    backgroundColor: theme.primarySubtle,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.tag,
    overflow: 'hidden',
  },
});
