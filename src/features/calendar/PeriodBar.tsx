import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { minTouchSlop, pressedStyle } from '@/components/pressable';
import { radius, size, space, stroke, theme, type } from '@/theme/theme';

export type PeriodBarProps = {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

/** Previous / next arrows, the period label and "Hoje" (RF-07). */
export function PeriodBar({ label, onPrevious, onNext, onToday }: PeriodBarProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('calendar.views.previous')}
        hitSlop={minTouchSlop(size.periodArrow)}
        onPress={onPrevious}
        style={(state) => [styles.arrow, pressedStyle(state)]}
      >
        <Icon name="chevron_left" size={size.iconSearch} color={theme.primary} />
      </Pressable>
      {/* RNF-09: the new period is announced when the label changes. */}
      <Text accessibilityLiveRegion="polite" style={styles.label}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('calendar.views.next')}
        hitSlop={minTouchSlop(size.periodArrow)}
        onPress={onNext}
        style={(state) => [styles.arrow, pressedStyle(state)]}
      >
        <Icon name="chevron_right" size={size.iconSearch} color={theme.primary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('calendar.views.today')}
        hitSlop={minTouchSlop(size.periodArrow)}
        onPress={onToday}
        style={(state) => [styles.today, pressedStyle(state)]}
      >
        <Text style={styles.todayText}>{t('calendar.views.today')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  arrow: {
    width: size.periodArrow,
    height: size.periodArrow,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primarySubtle,
  },
  label: { ...type.callout, flex: 1, color: theme.heading, textAlign: 'center' },
  today: {
    height: size.periodArrow,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: stroke.hairline,
    borderColor: theme.primary,
  },
  todayText: { ...type.fieldLabel, color: theme.primary },
});
