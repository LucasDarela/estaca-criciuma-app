import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentRef, Ref } from 'react';

import { pressedStyle } from '@/components/pressable';
import {
  formatCivil,
  instantOf,
  toSaoPauloWallTime,
  type CivilDate,
  type ClockTime,
} from '@/domain/time';
import { radius, size, space, theme, type } from '@/theme/theme';

import { useDateTimePicker } from './useDateTimePicker';

export type DateTimeFieldProps = {
  label: string;
  date: CivilDate;
  time: ClockTime;
  showDate: boolean;
  showTime?: boolean;
  onChangeDate: (date: CivilDate) => void;
  onChangeTime: (time: ClockTime) => void;
  error?: string;
  /** For `AccessibilityInfo.setAccessibilityFocus` (RNF-10). */
  fieldRef?: Ref<ComponentRef<typeof View>>;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A date button and a time button, both showing Sao Paulo values (RNF-05, RNF-08). */
export function DateTimeField({
  label,
  date,
  time,
  showDate,
  showTime = true,
  onChangeDate,
  onChangeTime,
  error,
  fieldRef,
}: DateTimeFieldProps) {
  const { i18n } = useTranslation();
  const picker = useDateTimePicker();
  const locale = i18n.language;
  const value = instantOf({ ...date, ...time });
  const timeText = `${pad(time.hour)}:${pad(time.minute)}`;

  const dateLabel = `${label}, ${formatCivil(date, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })}`;
  const timeLabel = `${label}, ${timeText}`;

  return (
    <View ref={fieldRef} style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {showDate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dateLabel}
            onPress={() =>
              picker.open(
                'date',
                value,
                (picked) => {
                  const { year, month, day } = toSaoPauloWallTime(picked);
                  onChangeDate({ year, month, day });
                },
                label,
              )
            }
            style={(state) => [styles.button, styles.dateButton, pressedStyle(state)]}
          >
            <Text style={styles.value}>
              {formatCivil(date, locale, { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </Pressable>
        ) : null}
        {showTime ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={timeLabel}
            onPress={() =>
              picker.open(
                'time',
                value,
                (picked) => {
                  const { hour, minute } = toSaoPauloWallTime(picked);
                  onChangeTime({ hour, minute });
                },
                label,
              )
            }
            style={(state) => [styles.button, pressedStyle(state)]}
          >
            <Text style={styles.value}>{timeText}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {picker.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  label: { ...type.fieldLabel, color: theme.text },
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    minHeight: size.input,
    minWidth: 96,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.input,
    backgroundColor: theme.surfaceMuted,
  },
  dateButton: { flex: 1 },
  value: { ...type.body, color: theme.text },
  error: { ...type.fieldError, color: theme.danger },
});
