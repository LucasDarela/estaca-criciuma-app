import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { FilterChip } from '@/components/FilterChip';
import { Icon } from '@/components/icons/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { minTouchSlop, pressedStyle } from '@/components/pressable';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { Segmented } from '@/components/Segmented';
import { Skeleton } from '@/components/Skeleton';
import { UnitPickerSheet } from '@/components/UnitPickerSheet';
import { matchesFilters, weekOf, type EventFilters } from '@/domain/calendar';
import { eventTypes } from '@/domain/eventTypes';
import { addDays, addMonthsClamped, civilDateOf, type CivilDate } from '@/domain/time';
import { unitIds } from '@/domain/units';
import { useLocale } from '@/i18n/useLocale';
import { useIsOnline } from '@/lib/network';
import { radius, size, space, stroke, theme, type, units } from '@/theme/theme';

import { useEventsAround } from './api';
import { DayView } from './DayView';
import { dayLabel, monthLabel, weekLabel } from './labels';
import { MonthView } from './MonthView';
import { PeriodBar } from './PeriodBar';
import { useNow } from './useNow';
import { WeekView } from './WeekView';

type AgendaView = 'month' | 'week' | 'day';

const skeletonCards = [0, 1, 2];

/** Aba Agenda: header, search, filters, view switch, period bar and the active view (RF-03 to RF-11). */
export function AgendaScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const online = useIsOnline();
  const now = useNow();
  const today = civilDateOf(now);

  const [view, setView] = useState<AgendaView>('month');
  const [selected, setSelected] = useState<CivilDate>(today);
  const [filters, setFilters] = useState<EventFilters>({ unitId: null, type: null, search: '' });
  const [pickingUnit, setPickingUnit] = useState(false);

  const { events, status, refetch } = useEventsAround(selected);

  const filtered = events.filter((event) =>
    matchesFilters(event, filters, {
      typeOne: t(`calendar.types.${event.type}.one`),
      typeOther: t(`calendar.types.${event.type}.other`),
      unitName: units[event.unitId].label,
    }),
  );

  const step = (direction: 1 | -1) =>
    setSelected(
      view === 'month'
        ? addMonthsClamped(selected, direction)
        : addDays(selected, (view === 'week' ? 7 : 1) * direction),
    );

  const week = weekOf(selected);
  const periodLabel =
    view === 'month'
      ? monthLabel(selected, locale)
      : view === 'week'
        ? weekLabel(week[0], week[6], locale)
        : dayLabel(selected, locale);

  const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });
  const unitName = filters.unitId ? units[filters.unitId].label : t('calendar.allUnits');

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        overline={t('calendar.overline')}
        title={t('calendar.title')}
        actions={[
          {
            icon: 'notifications',
            accessibilityLabel: t('calendar.notifications'),
            tone: 'neutral',
            onPress: () => router.push('/notifications'),
          },
        ]}
        showAvatar
      />
      {!online && status === 'success' ? <OfflineBanner /> : null}

      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <SearchField
              size="compact"
              placeholder={t('calendar.search')}
              value={filters.search}
              onChangeText={(search) => setFilters({ ...filters, search })}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('calendar.unitFilter')}: ${unitName}`}
            hitSlop={minTouchSlop(size.searchCompact)}
            onPress={() => setPickingUnit(true)}
            style={(state) => [styles.unitFilter, pressedStyle(state)]}
          >
            <View
              style={[
                styles.unitDot,
                { backgroundColor: filters.unitId ? units[filters.unitId].dot : theme.iconMuted },
              ]}
            />
            <Text numberOfLines={1} style={styles.unitName}>
              {unitName}
            </Text>
            <Icon name="expand_more" size={size.iconSearch} color={theme.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <FilterChip
            compact
            label={t('calendar.allTypes')}
            selected={filters.type === null}
            onPress={() => setFilters({ ...filters, type: null })}
          />
          {eventTypes.map((eventType) => (
            <FilterChip
              key={eventType}
              compact
              label={t(`calendar.types.${eventType}.other`)}
              selected={filters.type === eventType}
              onPress={() => setFilters({ ...filters, type: eventType })}
            />
          ))}
        </ScrollView>

        <Segmented<AgendaView>
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: t('calendar.views.month') },
            { value: 'week', label: t('calendar.views.week') },
            { value: 'day', label: t('calendar.views.day') },
          ]}
        />
        <PeriodBar
          label={periodLabel}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setSelected(today)}
        />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {status === 'loading' ? (
          <View testID="agenda-skeleton" style={styles.skeletons}>
            {skeletonCards.map((card) => (
              <Skeleton
                key={card}
                width="100%"
                height={size.avatarLarge + space.xl}
                radius="card"
              />
            ))}
          </View>
        ) : status === 'error' ? (
          <View style={styles.message}>
            <EmptyState
              message={t('calendar.empty.error')}
              action={{ label: t('calendar.empty.retry'), onPress: refetch }}
            />
          </View>
        ) : view === 'month' ? (
          <MonthView
            selected={selected}
            today={today}
            events={filtered}
            locale={locale}
            onSelect={setSelected}
            onOpenEvent={openEvent}
          />
        ) : view === 'week' ? (
          <WeekView
            selected={selected}
            today={today}
            events={filtered}
            locale={locale}
            onSelect={setSelected}
            onOpenEvent={openEvent}
          />
        ) : (
          <DayView
            selected={selected}
            today={today}
            now={now}
            events={filtered}
            locale={locale}
            onSelect={setSelected}
            onOpenEvent={openEvent}
          />
        )}
      </ScrollView>

      <UnitPickerSheet
        visible={pickingUnit}
        title={t('calendar.unitFilter')}
        noneLabel={t('calendar.allUnits')}
        value={filters.unitId}
        units={unitIds}
        onSelect={(unitId) => {
          setFilters({ ...filters, unitId });
          setPickingUnit(false);
        }}
        onClose={() => setPickingUnit(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  controls: {
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: theme.surface,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: theme.border,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  search: { flex: 1 },
  unitFilter: {
    height: size.searchCompact,
    maxWidth: size.unitFilterMaxWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    borderWidth: stroke.hairline,
    borderColor: theme.borderStrong,
    backgroundColor: theme.surface,
  },
  unitDot: { width: size.unitDot, height: size.unitDot, borderRadius: radius.pill },
  unitName: { ...type.listTitle, color: theme.text, flexShrink: 1 },
  chips: { gap: space.sm },
  body: { flex: 1, backgroundColor: theme.bg },
  bodyContent: { paddingTop: space.md },
  skeletons: { gap: space.md, padding: space.lg },
  message: { padding: space.lg },
});
