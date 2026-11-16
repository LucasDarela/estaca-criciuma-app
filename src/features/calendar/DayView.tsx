import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { pressedStyle } from '@/components/pressable';
import { DAY_WINDOW, dayBlock, eventsOnDate, weekOf, type CalendarEvent } from '@/domain/calendar';
import { formatTime, sameDate, toSaoPauloWallTime, type CivilDate } from '@/domain/time';
import { size, space, stroke, theme, type, units } from '@/theme/theme';

import { DayStrip } from './DayCell';

export type DayViewProps = {
  selected: CivilDate;
  today: CivilDate;
  /** The current instant, for the "now" line. */
  now: Date;
  /** Events already filtered by unit, type and search. */
  events: readonly CalendarEvent[];
  locale: string;
  onSelect: (date: CivilDate) => void;
  onOpenEvent: (id: string) => void;
};

const MINUTES_PER_HOUR = 60;
const hours = Array.from(
  { length: DAY_WINDOW.endHour - DAY_WINDOW.startHour + 1 },
  (_, index) => DAY_WINDOW.startHour + index,
);
const pxPerMinute = size.dayHourHeight / MINUTES_PER_HOUR;
const timelineHeight = (DAY_WINDOW.endHour - DAY_WINDOW.startHour) * size.dayHourHeight;
const gutter = space.xxl + space.lg;

/** Week strip and the 06:00-22:00 timeline of the selected day (RF-10). */
export function DayView({
  selected,
  today,
  now,
  events,
  locale,
  onSelect,
  onOpenEvent,
}: DayViewProps) {
  const { t } = useTranslation();
  const dayEvents = eventsOnDate(events, selected);
  const wall = toSaoPauloWallTime(now);
  const nowMinutes = (wall.hour - DAY_WINDOW.startHour) * MINUTES_PER_HOUR + wall.minute;
  const showNow =
    sameDate(selected, today) && nowMinutes >= 0 && nowMinutes <= timelineHeight / pxPerMinute;

  return (
    <View style={styles.root}>
      <View style={styles.strip}>
        <DayStrip
          days={weekOf(selected)}
          selected={selected}
          today={today}
          locale={locale}
          events={events}
          onSelect={onSelect}
        />
      </View>
      {dayEvents.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState message={t('calendar.empty.dayView')} />
        </View>
      ) : (
        <View style={styles.timeline}>
          {hours.map((hour) => (
            <View
              key={hour}
              pointerEvents="none"
              style={[styles.hourRow, { top: (hour - DAY_WINDOW.startHour) * size.dayHourHeight }]}
            >
              <Text style={styles.hourLabel}>{`${String(hour).padStart(2, '0')}:00`}</Text>
              <View style={styles.hourLine} />
            </View>
          ))}
          {dayEvents.map((event) => {
            const block = dayBlock(event, selected);
            if (!block) return null;
            const unit = units[event.unitId];
            const start = formatTime(event.startsAt);
            const end = formatTime(event.endsAt);
            return (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.a11y.block', {
                  title: event.title,
                  start,
                  end,
                  unit: unit.label,
                })}
                onPress={() => onOpenEvent(event.id)}
                style={(state) => [
                  styles.block,
                  {
                    top: block.topMinutes * pxPerMinute,
                    height: block.heightMinutes * pxPerMinute,
                    backgroundColor: unit.tint,
                    borderLeftColor: unit.dot,
                  },
                  pressedStyle(state),
                ]}
              >
                <Text numberOfLines={1} style={[styles.blockTitle, { color: unit.text }]}>
                  {event.title}
                </Text>
                <Text numberOfLines={1} style={[styles.blockTime, { color: unit.text }]}>
                  {`${start}–${end} · ${unit.label}`}
                </Text>
              </Pressable>
            );
          })}
          {showNow ? (
            <View
              testID="now-line"
              pointerEvents="none"
              style={[styles.nowLine, { top: nowMinutes * pxPerMinute }]}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  strip: { paddingHorizontal: space.lg, paddingTop: space.sm },
  empty: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  timeline: {
    height: timelineHeight,
    marginHorizontal: space.lg,
    marginBottom: space.xl,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: stroke.hairline,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: { ...type.caption, width: gutter, color: theme.textSubtle },
  hourLine: { flex: 1, height: stroke.hairline, backgroundColor: theme.divider },
  block: {
    position: 'absolute',
    left: gutter,
    right: 0,
    overflow: 'hidden',
    borderLeftWidth: size.eventCardBar,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  blockTitle: type.callout,
  blockTime: type.caption,
  nowLine: {
    position: 'absolute',
    left: gutter,
    right: 0,
    height: size.nowLine,
    backgroundColor: theme.danger,
  },
});
