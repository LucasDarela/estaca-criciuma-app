import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { dayPart, eventsOnDate, monthGrid, unitDots, type CalendarEvent } from '@/domain/calendar';
import { eventTypeIcon } from '@/domain/eventTypes';
import { sameDate, type CivilDate } from '@/domain/time';
import { space, theme, type } from '@/theme/theme';

import { DayCell, WeekdayHeader } from './DayCell';
import { dayA11yLabel, eventTimeLabel, summaryParts } from './labels';

export type MonthViewProps = {
  selected: CivilDate;
  today: CivilDate;
  /** Events already filtered by unit, type and search. */
  events: readonly CalendarEvent[];
  locale: string;
  onSelect: (date: CivilDate) => void;
  onOpenEvent: (id: string) => void;
};

/** Month grid plus the summary and cards of the selected day (RF-08). */
export function MonthView({
  selected,
  today,
  events,
  locale,
  onSelect,
  onOpenEvent,
}: MonthViewProps) {
  const { t } = useTranslation();
  const dayEvents = eventsOnDate(events, selected);
  const parts = summaryParts(selected, locale);

  return (
    <View style={styles.root}>
      <View style={styles.grid}>
        <WeekdayHeader />
        <View style={styles.cells}>
          {monthGrid(selected).map((date) => {
            const onDate = eventsOnDate(events, date);
            return (
              <View key={`${date.month}-${date.day}`} style={styles.cellBox}>
                <DayCell
                  date={date}
                  accessibilityLabel={dayA11yLabel(
                    date,
                    onDate.length,
                    sameDate(date, today),
                    locale,
                    t,
                  )}
                  selected={sameDate(date, selected)}
                  today={sameDate(date, today)}
                  muted={date.month !== selected.month}
                  dots={unitDots(onDate)}
                  onPress={() => onSelect(date)}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.list}>
        <View style={styles.summary}>
          <Text accessibilityRole="header" style={styles.summaryTitle}>
            {t('calendar.month.summary', parts)}
          </Text>
          <Text style={styles.count}>{t('calendar.month.count', { count: dayEvents.length })}</Text>
        </View>
        {dayEvents.length === 0 ? (
          <EmptyState message={t('calendar.empty.day')} />
        ) : (
          dayEvents.map((event) => (
            <EventCard
              key={event.id}
              title={event.title}
              timeLabel={eventTimeLabel(event, dayPart(event, selected), t)}
              unitId={event.unitId}
              typeIcon={eventTypeIcon[event.type]}
              place={event.location || undefined}
              onPress={() => onOpenEvent(event.id)}
            />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  grid: { gap: space.xs, paddingHorizontal: space.lg, paddingTop: space.sm },
  cells: { flexDirection: 'row', flexWrap: 'wrap' },
  // 7 columns: each box is one seventh of the row.
  cellBox: { width: `${100 / 7}%` },
  list: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
  summary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  summaryTitle: { ...type.callout, color: theme.heading, flexShrink: 1 },
  count: { ...type.caption, color: theme.textMuted },
});
