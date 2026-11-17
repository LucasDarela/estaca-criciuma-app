import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudiencePicker } from '@/components/AudiencePicker';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { ChipGroup } from '@/components/ChipGroup';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FilterChip } from '@/components/FilterChip';
import { Icon } from '@/components/icons/Icon';
import { pressedStyle } from '@/components/pressable';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import { toggleAudience } from '@/domain/audience';
import type { CalendarEvent } from '@/domain/calendar';
import {
  EVENT_LIMITS,
  draftFromEvent,
  isDraftDirty,
  newEventDraft,
  toEventInput,
  validateDraft,
  validateLink,
  type DraftError,
  type DraftField,
  type EventDraft,
} from '@/domain/eventForm';
import { eventTypeIcon, eventTypes, type EventType } from '@/domain/eventTypes';
import type { UnitId } from '@/domain/units';
import { PushError, pushErrorMessageKey, sendPush } from '@/lib/push';
import { radius, size, space, theme, type, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { EventWriteError, createEvent, updateEvent, useEventCache } from './api';
import { DateTimeField } from './DateTimeField';
import { FormHeader } from './FormHeader';
import { MeetingAgendaCard } from './MeetingAgendaCard';
import { MeetingAgendaSheet } from './MeetingAgendaSheet';
import { useMeetingAgenda } from './useMeetingAgenda';

export type EventFormScreenProps = { mode: 'new' } | { mode: 'edit'; event: CalendarEvent };

type Focusable = ComponentRef<typeof TextInput>;

/** `/event/new` and `/event/[id]/edit` (RF-03 to RF-15, RF-17, RF-20). */
export function EventFormScreen(props: EventFormScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const viewer = useViewer();
  const cache = useEventCache();
  const event = props.mode === 'edit' ? props.event : null;

  const [initial] = useState<EventDraft>(() =>
    event ? draftFromEvent(event) : newEventDraft(new Date(), viewer.publishableUnits),
  );
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [touched, setTouched] = useState<ReadonlySet<DraftField>>(new Set());
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pendingType, setPendingType] = useState<EventType | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState<string | undefined>();
  const newId = useRef(Crypto.randomUUID());
  const inFlight = useRef(false);

  const titleRef = useRef<Focusable>(null);
  const endRef = useRef<ComponentRef<typeof View>>(null);
  const locationRef = useRef<Focusable>(null);
  const notesRef = useRef<Focusable>(null);
  const audienceRef = useRef<ComponentRef<typeof View>>(null);

  // The agenda card: a new event while it is a meeting the viewer leads; an existing one only
  // while it is saved as a meeting (items are written to the saved event right away).
  const isMeeting = draft.type === 'meeting';
  const agendaVisible = event
    ? event.type === 'meeting' && isMeeting && viewer.canLead(event.unitId)
    : isMeeting && viewer.canLead(draft.unitId);
  const agenda = useMeetingAgenda(event?.id ?? null, agendaVisible);

  const errors = validateDraft(draft);
  const valid = Object.keys(errors).length === 0;
  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const touch = (...fields: DraftField[]) =>
    setTouched((current) => new Set([...current, ...fields]));

  const messageOf = (field: DraftField, error: DraftError | undefined): string | undefined => {
    if (!error) return undefined;
    switch (field) {
      case 'title':
        return t(error === 'required' ? 'events.form.name.required' : 'events.form.name.tooLong');
      case 'end':
        return t('events.form.endBeforeStart');
      case 'location':
        return t('events.form.location.tooLong');
      case 'notes':
        return t('events.form.notes.tooLong');
      case 'audience':
        return t('push.audience.summary.empty');
    }
  };
  const shown = (field: DraftField) =>
    touched.has(field) ? messageOf(field, errors[field]) : undefined;

  function onInvalidSave() {
    const fields = Object.keys(errors) as DraftField[];
    touch(...fields);
    const first = fields[0];
    if (!first) return;
    AccessibilityInfo.announceForAccessibility(messageOf(first, errors[first]) ?? '');
    const inputs: Partial<Record<DraftField, React.RefObject<Focusable | null>>> = {
      title: titleRef,
      location: locationRef,
      notes: notesRef,
    };
    const input = inputs[first]?.current;
    if (input) {
      input.focus();
      return;
    }
    const view = first === 'end' ? endRef.current : audienceRef.current;
    const handle = view ? findNodeHandle(view) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }

  function changeType(next: EventType) {
    if (next === draft.type) return;
    const hasItems = agenda.items.length > 0;
    if (draft.type === 'meeting' && hasItems) {
      setPendingType(next);
      return;
    }
    update({ type: next });
  }

  function changeUnit(unitId: UnitId) {
    if (unitId === draft.unitId) return;
    update({ unitId, audience: [] });
    if (!event && !viewer.canLead(unitId)) agenda.clearLocal();
  }

  function addLink() {
    const problem = validateLink(linkText, draft.links);
    if (problem) {
      setLinkError(
        t(problem === 'notHttps' ? 'events.form.links.notHttps' : 'events.form.links.tooMany'),
      );
      return;
    }
    update({ links: [...draft.links, linkText.trim()] });
    setLinkText('');
    setLinkError(undefined);
  }

  const dirty = isDraftDirty(initial, draft) || (!event && agenda.items.length > 0);
  const cancel = () => (dirty ? setDiscarding(true) : router.back());

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const input = toEventInput(draft);
      const stored = event
        ? await updateEvent(event.id, input)
        : await createEvent(
            newId.current,
            input,
            agendaVisible ? agenda.items.map(({ kind, text }) => ({ kind, text })) : [],
          );
      cache.saved(stored);

      let message = t('events.form.saved');
      if (draft.notify) {
        try {
          await sendPush({ kind: 'event', itemId: stored.id, audience: draft.audience });
          message = t('events.form.savedAndNotified');
        } catch (thrown) {
          message = t(pushErrorMessageKey[thrown instanceof PushError ? thrown.code : 'unknown']);
        }
      }
      toast.show({
        message,
        tone:
          message === t('events.form.saved') || message === t('events.form.savedAndNotified')
            ? 'success'
            : 'neutral',
      });

      if (event) {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/event/[id]', params: { id: stored.id } });
      } else {
        router.replace({ pathname: '/event/[id]', params: { id: stored.id } });
      }
    } catch (thrown) {
      const code = thrown instanceof EventWriteError ? thrown.code : 'unknown';
      if (code === 'forbidden') {
        toast.show({ message: t('events.errors.forbidden') });
        router.back();
      } else if (code === 'not_found') {
        toast.show({ message: t('calendar.detail.gone') });
        router.replace('/agenda');
      } else if (code === 'network') {
        toast.show({ message: t('auth.errors.network') });
      } else {
        toast.show({ message: t('common.genericError') });
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const title = event ? t('events.form.editTitle') : t('events.form.newTitle');

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FormHeader
        title={title}
        onCancel={cancel}
        onSave={() => void submit()}
        valid={valid}
        saving={saving}
        onInvalidSave={onInvalidSave}
      />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View
          pointerEvents={saving ? 'none' : 'auto'}
          accessibilityState={{ busy: saving }}
          style={styles.form}
        >
          <View style={styles.block}>
            <TextField
              ref={titleRef}
              label={t('events.form.name.label')}
              placeholder={t('events.form.name.placeholder')}
              value={draft.title}
              onChangeText={(title) => update({ title })}
              onBlur={() => touch('title')}
              error={shown('title')}
            />
          </View>

          <View style={styles.block}>
            <Checkbox
              label={t('events.form.singleDay')}
              checked={draft.singleDay}
              onChange={(singleDay) =>
                update(singleDay ? { singleDay } : { singleDay, endDate: draft.startDate })
              }
            />
            <DateTimeField
              label={t('events.form.start')}
              date={draft.startDate}
              time={draft.startTime}
              showDate
              onChangeDate={(startDate) => {
                touch('end');
                update(draft.singleDay ? { startDate, endDate: startDate } : { startDate });
              }}
              onChangeTime={(startTime) => {
                touch('end');
                update({ startTime });
              }}
            />
            <DateTimeField
              fieldRef={endRef}
              label={t('events.form.end')}
              date={draft.singleDay ? draft.startDate : draft.endDate}
              time={draft.endTime}
              showDate={!draft.singleDay}
              onChangeDate={(endDate) => {
                touch('end');
                update({ endDate });
              }}
              onChangeTime={(endTime) => {
                touch('end');
                update({ endTime });
              }}
              error={shown('end')}
            />
          </View>

          <View style={styles.block}>
            <ChipGroup label={t('events.form.type')} role="radiogroup">
              {eventTypes.map((eventType) => (
                <FilterChip
                  key={eventType}
                  role="radio"
                  compact
                  icon={eventTypeIcon[eventType]}
                  label={t(`calendar.types.${eventType}.one`)}
                  selected={draft.type === eventType}
                  onPress={() => changeType(eventType)}
                />
              ))}
            </ChipGroup>
            <ChipGroup label={t('events.form.unit')} role="radiogroup">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.units}>
                <View style={styles.unitRow}>
                  {viewer.publishableUnits.map((unitId) => (
                    <FilterChip
                      key={unitId}
                      role="radio"
                      compact
                      label={units[unitId].label}
                      dotColor={units[unitId].dot}
                      selected={draft.unitId === unitId}
                      onPress={() => changeUnit(unitId)}
                    />
                  ))}
                </View>
              </ScrollView>
            </ChipGroup>
          </View>

          {agendaVisible ? (
            <MeetingAgendaCard counts={agenda.counts} onPress={() => setAgendaOpen(true)} />
          ) : null}

          <View style={styles.block}>
            <TextField
              ref={locationRef}
              label={t('events.form.location.label')}
              placeholder={t('events.form.location.placeholder')}
              value={draft.location}
              onChangeText={(location) => update({ location })}
              onBlur={() => touch('location')}
              error={shown('location')}
            />
            <TextField
              ref={notesRef}
              label={t('events.form.notes.label')}
              placeholder={t('events.form.notes.placeholder')}
              value={draft.notes}
              onChangeText={(notes) => update({ notes })}
              onBlur={() => touch('notes')}
              error={shown('notes')}
              multiline
            />
            <View style={styles.links}>
              <View style={styles.linkRow}>
                <View style={styles.linkField}>
                  <TextField
                    label={t('events.form.links.label')}
                    placeholder={t('events.form.links.placeholder')}
                    value={linkText}
                    onChangeText={(text) => {
                      setLinkText(text);
                      setLinkError(undefined);
                    }}
                    onSubmitEditing={addLink}
                    autoCapitalize="none"
                    keyboardType="url"
                    maxLength={EVENT_LIMITS.link}
                    error={linkError}
                  />
                </View>
                <Button
                  label={t('events.form.links.add')}
                  variant="secondary"
                  size="compact"
                  onPress={addLink}
                />
              </View>
              {draft.links.map((link) => (
                <View key={link} style={styles.linkItem}>
                  <Text style={styles.linkText} numberOfLines={1}>
                    {link}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('events.form.links.remove', { link })}
                    hitSlop={space.sm}
                    onPress={() => update({ links: draft.links.filter((l) => l !== link) })}
                    style={(state) => pressedStyle(state)}
                  >
                    <Icon name="close" size={size.iconSearch} color={theme.iconMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.block}>
            <Checkbox
              label={t('events.form.notify.label')}
              hint={t('events.form.notify.hint')}
              checked={draft.notify}
              onChange={(notify) =>
                update({
                  notify,
                  audience:
                    notify && draft.audience.length === 0
                      ? toggleAudience([], 'all', draft.unitId)
                      : draft.audience,
                })
              }
            />
            {draft.notify ? (
              <View ref={audienceRef}>
                <AudiencePicker
                  unitId={draft.unitId}
                  value={draft.audience}
                  onChange={(audience) => {
                    touch('audience');
                    update({ audience });
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={discarding}
        title={t('events.form.discard.title')}
        message={t('events.form.discard.message')}
        confirmLabel={t('events.form.discard.confirm')}
        cancelLabel={t('events.form.discard.keep')}
        confirmVariant="danger"
        onConfirm={() => {
          setDiscarding(false);
          router.back();
        }}
        onCancel={() => setDiscarding(false)}
      />
      <ConfirmSheet
        visible={pendingType !== null}
        title={t('events.form.removeAgenda.title')}
        message={t('events.form.removeAgenda.message')}
        confirmLabel={t('events.form.removeAgenda.confirm')}
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingType) update({ type: pendingType });
          agenda.clearLocal();
          setPendingType(null);
        }}
        onCancel={() => setPendingType(null)}
      />
      <MeetingAgendaSheet
        visible={agendaOpen && agendaVisible}
        title={draft.title}
        items={agenda.items}
        busy={agenda.busy}
        onAdd={agenda.add}
        onRemove={agenda.remove}
        onClose={() => setAgendaOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  body: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl },
  form: { gap: space.lg },
  block: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: theme.surface,
  },
  units: { flex: 1 },
  unitRow: { flexDirection: 'row', gap: space.sm },
  links: { gap: space.sm },
  linkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  linkField: { flex: 1 },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  linkText: { ...type.body, flex: 1, color: theme.link },
});
