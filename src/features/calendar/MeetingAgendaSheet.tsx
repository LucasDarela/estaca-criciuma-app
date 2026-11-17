import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Icon } from '@/components/icons/Icon';
import { pressedStyle } from '@/components/pressable';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { StatusTag } from '@/components/StatusTag';
import {
  MEETING_ITEM_MAX,
  countByKind,
  itemsOfKind,
  shortDate,
  type MeetingItem,
  type MeetingItemKind,
} from '@/domain/meetingItems';
import { radius, size, space, stroke, theme, type } from '@/theme/theme';

const SHEET_HEIGHT_RATIO = 0.82;

export type MeetingAgendaSheetProps = {
  visible: boolean;
  /** The event name; empty falls back to `Reunião`. */
  title: string;
  items: readonly MeetingItem[];
  /** A write is in flight: the field and the buttons are disabled. */
  busy: boolean;
  onAdd: (kind: MeetingItemKind, text: string) => void;
  onRemove: (item: MeetingItem) => void;
  onClose: () => void;
};

const tabKey = { agenda: 'agenda', decision: 'decisions', pending: 'pending' } as const;

/** RF-18, RF-19. The content mounts only while open, so each opening starts on the first tab. */
export function MeetingAgendaSheet({ visible, title, ...rest }: MeetingAgendaSheetProps) {
  const { t } = useTranslation();
  const heading = title.trim() === '' ? t('events.meeting.fallbackTitle') : title;
  return (
    <Sheet
      visible={visible}
      onClose={rest.onClose}
      accessibilityLabel={heading}
      heightRatio={SHEET_HEIGHT_RATIO}
    >
      {visible ? <AgendaContent heading={heading} {...rest} /> : null}
    </Sheet>
  );
}

function AgendaContent({
  heading,
  items,
  busy,
  onAdd,
  onRemove,
  onClose,
}: Omit<MeetingAgendaSheetProps, 'visible' | 'title'> & { heading: string }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<MeetingItemKind>('agenda');
  const [text, setText] = useState('');
  const counts = countByKind(items);
  const visibleItems = itemsOfKind(items, kind);
  const key = tabKey[kind];

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed === '' || busy) return;
    onAdd(kind, trimmed);
    setText('');
  };

  return (
    <View style={styles.content}>
      <View style={styles.top}>
        <View style={styles.titles}>
          <Text style={styles.overline}>{t('events.meeting.overline')}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {heading}
          </Text>
        </View>
        <Button label={t('events.meeting.done')} variant="ghost" size="compact" onPress={onClose} />
      </View>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'agenda', label: t('events.meeting.tabs.agenda'), count: counts.agenda },
          { value: 'decision', label: t('events.meeting.tabs.decisions'), count: counts.decision },
          { value: 'pending', label: t('events.meeting.tabs.pending'), count: counts.pending },
        ]}
      />
      <Text style={styles.hint}>{t(`events.meeting.hint.${key}`)}</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {visibleItems.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            index={index}
            busy={busy}
            onRemove={() => onRemove(item)}
          />
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <TextInput
          accessibilityLabel={t(`events.meeting.placeholder.${key}`)}
          placeholder={t(`events.meeting.placeholder.${key}`)}
          placeholderTextColor={theme.textSubtle}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          maxLength={MEETING_ITEM_MAX}
          editable={!busy}
          returnKeyType="done"
          submitBehavior="submit"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('events.meeting.add')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={submit}
          style={(state) => [styles.addButton, busy && styles.disabled, pressedStyle(state)]}
        >
          <Icon name="add" size={size.icon} color={theme.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

function ItemRow({
  item,
  index,
  busy,
  onRemove,
}: {
  item: MeetingItem;
  index: number;
  busy: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const tag =
    item.carriedFromDate !== null
      ? t('events.meeting.carried', { date: shortDate(item.carriedFromDate) })
      : item.kind === 'pending'
        ? t('events.meeting.nextMeeting')
        : null;
  const label = tag === null ? item.text : t('events.meeting.itemLabel', { text: item.text, tag });

  return (
    <View style={styles.row}>
      <View accessible accessibilityLabel={label} style={styles.rowMain}>
        <Marker kind={item.kind} index={index} />
        <View style={styles.rowTexts}>
          <Text style={styles.itemText}>{item.text}</Text>
          {tag === null ? null : (
            <View style={styles.tag}>
              <StatusTag tone={item.carriedFromDate !== null ? 'info' : 'warning'} label={tag} />
            </View>
          )}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('events.meeting.remove', { text: item.text })}
        disabled={busy}
        hitSlop={space.sm}
        onPress={onRemove}
        style={(state) => [styles.remove, pressedStyle(state)]}
      >
        <Icon name="close" size={size.iconSearch} color={theme.iconMuted} />
      </Pressable>
    </View>
  );
}

function Marker({ kind, index }: { kind: MeetingItemKind; index: number }) {
  if (kind === 'agenda') {
    return (
      <View style={[styles.marker, { backgroundColor: theme.primarySubtle }]}>
        <Text
          testID={`marker-${index + 1}`}
          style={[styles.markerNumber, { color: theme.primary }]}
        >
          {index + 1}
        </Text>
      </View>
    );
  }
  const decision = kind === 'decision';
  return (
    <View
      style={[
        styles.marker,
        { backgroundColor: decision ? theme.successSubtle : theme.warningSubtle },
      ]}
    >
      <Icon
        name={decision ? 'check' : 'arrow_forward'}
        size={size.iconSearch}
        color={decision ? theme.success : theme.warningText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titles: { flex: 1, gap: space.xs },
  overline: { ...type.overline, color: theme.primary },
  title: { ...type.headline, color: theme.heading },
  hint: { ...type.caption, color: theme.textMuted },
  list: { flex: 1 },
  listContent: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: theme.divider,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowTexts: { flex: 1, gap: space.xs },
  tag: { flexDirection: 'row' },
  itemText: { ...type.body, color: theme.text },
  marker: {
    width: size.dayCircle,
    height: size.dayCircle,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  markerNumber: type.listTitle,
  remove: { padding: space.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    ...type.body,
    flex: 1,
    minHeight: size.input,
    paddingHorizontal: space.lg,
    borderRadius: radius.input,
    backgroundColor: theme.surfaceMuted,
    color: theme.text,
  },
  addButton: {
    width: size.input,
    height: size.input,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    backgroundColor: theme.primary,
  },
  disabled: { opacity: 0.5 },
});
