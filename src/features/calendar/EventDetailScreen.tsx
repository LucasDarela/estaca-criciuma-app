import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/icons/Icon';
import { minTouchSlop, pressedStyle } from '@/components/pressable';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/toast/ToastProvider';
import type { CalendarEvent } from '@/domain/calendar';
import { eventTypeIcon } from '@/domain/eventTypes';
import { formatTime } from '@/domain/time';
import { UnitTag } from '@/components/UnitTag';
import { useLocale } from '@/i18n/useLocale';
import { size, space, theme, type, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { EventWriteError, deleteEvent, useEvent, useEventCache } from './api';
import { addToDeviceCalendar, openInMaps, shareEvent } from './eventActions';
import { eventDateLabel } from './labels';
import { MeetingAgendaCard } from './MeetingAgendaCard';
import { MeetingAgendaSheet } from './MeetingAgendaSheet';
import { useMeetingAgenda } from './useMeetingAgenda';

/** `/event/[id]`: the full event with the map, calendar and share actions (RF-12 to RF-16). */
export function EventDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const locale = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useEvent(id);
  const viewer = useViewer();
  const cache = useEventCache();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const deleting = useRef(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/agenda'));
  const event = query.data;
  const canPublish = event ? viewer.canPublish(event.unitId) : false;
  const showAgenda = event ? event.type === 'meeting' && viewer.canLead(event.unitId) : false;
  const agenda = useMeetingAgenda(event?.id ?? null, showAgenda);

  async function remove(current: CalendarEvent) {
    if (deleting.current) return;
    deleting.current = true;
    setConfirmingDelete(false);
    try {
      await deleteEvent(current.id);
      cache.deleted(current.id);
      toast.show({ message: t('events.delete.done'), tone: 'success' });
      router.replace('/agenda');
    } catch (thrown) {
      const code = thrown instanceof EventWriteError ? thrown.code : 'unknown';
      if (code === 'not_found') {
        toast.show({ message: t('calendar.detail.gone') });
        router.replace('/agenda');
      } else if (code === 'forbidden') {
        toast.show({ message: t('events.errors.forbidden') });
      } else if (code === 'network') {
        toast.show({ message: t('auth.errors.network') });
      } else {
        toast.show({ message: t('common.genericError') });
      }
    } finally {
      deleting.current = false;
    }
  }

  /** Runs a system action; a failure shows `failureMessage` instead of leaving the tap silent. */
  async function run(action: () => Promise<void>, failureMessage: string) {
    try {
      await action();
    } catch {
      toast.show({ message: failureMessage });
    }
  }

  async function addToCalendar(current: CalendarEvent) {
    await run(async () => {
      if ((await addToDeviceCalendar(current)) === 'saved') {
        toast.show({ message: t('calendar.detail.added'), tone: 'success' });
      }
    }, t('calendar.detail.calendarUnavailable'));
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('calendar.title')}
        onBack={goBack}
        actions={
          event && canPublish
            ? [
                {
                  icon: 'edit',
                  accessibilityLabel: t('events.detail.edit'),
                  tone: 'neutral',
                  onPress: () =>
                    router.push({ pathname: '/event/[id]/edit', params: { id: event.id } }),
                },
                {
                  icon: 'delete',
                  accessibilityLabel: t('events.detail.delete'),
                  tone: 'neutral',
                  onPress: () => setConfirmingDelete(true),
                },
              ]
            : undefined
        }
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {event === undefined ? (
          query.isError ? (
            <EmptyState
              message={t('calendar.empty.error')}
              action={{ label: t('calendar.empty.retry'), onPress: () => void query.refetch() }}
            />
          ) : (
            <View testID="event-skeleton" style={styles.skeleton}>
              <Skeleton width="40%" height={size.iconSearch} />
              <Skeleton width="90%" height={size.avatar} />
              <Skeleton width="60%" height={size.icon} />
            </View>
          )
        ) : event === null ? (
          <EmptyState
            icon="event"
            message={t('calendar.detail.gone')}
            action={{
              label: t('calendar.detail.seeAgenda'),
              onPress: () => router.replace('/agenda'),
            }}
          />
        ) : (
          <>
            <View style={styles.overline}>
              <Icon name={eventTypeIcon[event.type]} size={size.iconSearch} color={theme.primary} />
              <Text style={styles.overlineText}>{t(`calendar.types.${event.type}.one`)}</Text>
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {event.title}
            </Text>
            <View style={styles.when}>
              <Text style={styles.date}>{eventDateLabel(event, locale)}</Text>
              <Text style={styles.time}>
                {`${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`}
              </Text>
            </View>

            {event.location !== '' ? (
              <View style={styles.place}>
                <Icon name="location_on" size={size.icon} color={theme.textMuted} />
                <Text style={styles.placeText}>{event.location}</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t('calendar.detail.openMap')}
                  hitSlop={minTouchSlop(size.icon)}
                  onPress={() =>
                    void run(() => openInMaps(event.location), t('common.genericError'))
                  }
                  style={(state) => pressedStyle(state)}
                >
                  <Text style={styles.link}>{t('calendar.detail.openMap')}</Text>
                </Pressable>
              </View>
            ) : null}

            <UnitTag unitId={event.unitId} />

            {event.notes !== '' ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  {t('calendar.detail.notes')}
                </Text>
                <Text style={styles.notes}>{event.notes}</Text>
              </View>
            ) : null}

            {event.links.length > 0 ? (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  {t('calendar.detail.links')}
                </Text>
                {event.links.map((link) => (
                  <Pressable
                    key={link}
                    accessibilityRole="link"
                    accessibilityLabel={link}
                    hitSlop={minTouchSlop(size.icon)}
                    onPress={() => void run(() => Linking.openURL(link), t('common.genericError'))}
                    style={(state) => pressedStyle(state)}
                  >
                    <Text style={styles.link}>{link}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {showAgenda ? (
              <MeetingAgendaCard counts={agenda.counts} onPress={() => setAgendaOpen(true)} />
            ) : null}

            <View style={styles.actions}>
              <Button
                variant="secondary"
                icon="event"
                label={t('calendar.detail.addToCalendar')}
                onPress={() => void addToCalendar(event)}
              />
              <Button
                variant="outline"
                icon="share"
                label={t('calendar.detail.share')}
                onPress={() =>
                  void run(
                    () =>
                      shareEvent(event, {
                        date: eventDateLabel(event, locale),
                        unitName: units[event.unitId].label,
                      }),
                    t('common.genericError'),
                  )
                }
              />
            </View>
          </>
        )}
      </ScrollView>
      {event ? (
        <>
          <ConfirmSheet
            visible={confirmingDelete}
            title={t('events.delete.title')}
            message={t('events.delete.message', { title: event.title })}
            confirmLabel={t('events.delete.confirm')}
            cancelLabel={t('common.cancel')}
            confirmVariant="danger"
            onConfirm={() => void remove(event)}
            onCancel={() => setConfirmingDelete(false)}
          />
          <MeetingAgendaSheet
            visible={agendaOpen && showAgenda}
            title={event.title}
            items={agenda.items}
            busy={agenda.busy}
            onAdd={agenda.add}
            onRemove={agenda.remove}
            onClose={() => setAgendaOpen(false)}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  body: { flex: 1 },
  content: { gap: space.lg, padding: space.lg, paddingBottom: space.xxl },
  skeleton: { gap: space.lg },
  overline: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  overlineText: { ...type.overline, color: theme.primary },
  title: { ...type.title, color: theme.heading },
  when: { gap: space.xs },
  date: { ...type.body, color: theme.text },
  time: { ...type.body, color: theme.textMuted },
  place: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  placeText: { ...type.body, color: theme.text, flexShrink: 1 },
  link: { ...type.callout, color: theme.link },
  section: { gap: space.sm },
  sectionTitle: { ...type.callout, color: theme.heading },
  notes: { ...type.body, color: theme.textBody },
  actions: { gap: space.md, paddingTop: space.sm },
});
