import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pressedStyle } from '@/components/pressable';
import { eventsOnDate, unitDots, type CalendarEvent } from '@/domain/calendar';
import { sameDate, type CivilDate } from '@/domain/time';
import type { UnitId } from '@/domain/units';
import { radius, size, space, stroke, theme, type, units } from '@/theme/theme';

import { dayA11yLabel } from './labels';

export type DayCellProps = {
  date: CivilDate;
  accessibilityLabel: string;
  selected: boolean;
  today: boolean;
  /** Day outside the visible month (grey number). */
  muted?: boolean;
  /** Up to 3 unit colors (RF-08); the label and the list below carry the unit too (RNF-08). */
  dots?: readonly UnitId[];
  onPress: () => void;
};

export function DayCell({
  date,
  accessibilityLabel,
  selected,
  today,
  muted = false,
  dots = [],
  onPress,
}: DayCellProps) {
  const numberColor = selected
    ? theme.onPrimary
    : muted
      ? theme.textDisabled
      : today
        ? theme.primary
        : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(state) => [styles.cell, pressedStyle(state)]}
    >
      <View
        style={[styles.circle, selected && styles.selected, today && !selected && styles.today]}
      >
        <Text style={[styles.number, { color: numberColor }]}>{date.day}</Text>
      </View>
      <View style={styles.dots}>
        {dots.map((unitId) => (
          <View
            key={unitId}
            testID="unit-dot"
            style={[styles.dot, { backgroundColor: units[unitId].dot }]}
          />
        ))}
      </View>
    </Pressable>
  );
}

/** "D S T Q Q S S": decorative, since each day button already says its full date. */
export function WeekdayHeader() {
  const { t } = useTranslation();
  const letters = t('calendar.weekdaysShort', { returnObjects: true }) as string[];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.row}
    >
      {letters.map((letter, index) => (
        <Text key={index} style={styles.weekday}>
          {letter}
        </Text>
      ))}
    </View>
  );
}

export type DayStripProps = {
  /** The 7 days, Sunday to Saturday. */
  days: readonly CivilDate[];
  selected: CivilDate;
  today: CivilDate;
  locale: string;
  events: readonly CalendarEvent[];
  onSelect: (date: CivilDate) => void;
};

/** Week strip shared by the Semana and Dia views. */
export function DayStrip({ days, selected, today, locale, events, onSelect }: DayStripProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.strip}>
      <WeekdayHeader />
      <View style={styles.row}>
        {days.map((date) => {
          const onDate = eventsOnDate(events, date);
          return (
            <View key={`${date.month}-${date.day}`} style={styles.stripCell}>
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
                dots={unitDots(onDate)}
                onPress={() => onSelect(date)}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.xs },
  row: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    ...type.caption,
    color: theme.textSubtle,
  },
  cell: { height: size.monthCell, alignItems: 'center' },
  stripCell: { flex: 1 },
  circle: {
    width: size.dayCircle,
    height: size.dayCircle,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: theme.primary },
  today: { borderWidth: stroke.strong, borderColor: theme.primary },
  number: type.caption,
  dots: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    gap: space.xs,
  },
  dot: { width: size.unitDot, height: size.unitDot, borderRadius: radius.pill },
});
