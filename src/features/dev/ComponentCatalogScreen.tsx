import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudiencePicker } from '@/components/AudiencePicker';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { FilterChip } from '@/components/FilterChip';
import { glyphs, type IconName } from '@/components/icons/glyphs';
import { Icon } from '@/components/icons/Icon';
import { ListItem } from '@/components/ListItem';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { Skeleton } from '@/components/Skeleton';
import { StatusTag } from '@/components/StatusTag';
import { Switch } from '@/components/Switch';
import { TabBar } from '@/components/TabBar';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import { UnitTag } from '@/components/UnitTag';
import type { AudienceKey } from '@/domain/audience';
import { unitIds } from '@/domain/units';
import { size, space, theme, type, units } from '@/theme/theme';

type SectionKey =
  | 'button'
  | 'textField'
  | 'searchField'
  | 'filterChip'
  | 'audiencePicker'
  | 'audiencePicker'
  | 'unitTag'
  | 'statusTag'
  | 'badge'
  | 'segmented'
  | 'eventCard'
  | 'listItem'
  | 'avatar'
  | 'switch'
  | 'toast'
  | 'tabBar'
  | 'screenHeader'
  | 'sheet'
  | 'emptyState'
  | 'offlineBanner'
  | 'skeleton'
  | 'icons';

const iconNames = Object.keys(glyphs) as IconName[];
type DemoTab = 'agenda' | 'board' | 'leadership' | 'notes' | 'profile';
type DemoView = 'month' | 'week' | 'day';

function Section({ section, children }: { section: SectionKey; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t(`dev.catalog.section.${section}`)}
      </Text>
      {children}
    </View>
  );
}

/** Dev-only gallery of every design system component and state (RF-21). */
export function ComponentCatalogScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const sample = (key: string) => t(`dev.catalog.sample.${key}`);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState(true);
  const [audience, setAudience] = useState<AudienceKey[]>(['primary']);
  const [view, setView] = useState<DemoView>('month');
  const [enabled, setEnabled] = useState(true);
  const [tab, setTab] = useState<DemoTab>('agenda');
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState('');
  const noop = () => undefined;

  const tabs = [
    { route: 'agenda', icon: 'calendar_month', label: t('tabs.agenda') },
    { route: 'board', icon: 'campaign', label: t('tabs.board') },
    { route: 'leadership', icon: 'account_tree', label: t('tabs.leadership') },
    { route: 'notes', icon: 'edit_note', label: t('tabs.notes') },
    { route: 'profile', icon: 'account_circle', label: t('tabs.profile') },
  ] as const;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('dev.catalog.title')}
        </Text>

        <Section section="button">
          <View style={styles.column}>
            <Button label={sample('label')} onPress={noop} />
            <Button label={sample('label')} variant="secondary" icon="add" onPress={noop} />
            <Button label={sample('label')} variant="outline" onPress={noop} />
            <Button label={sample('label')} variant="ghost" onPress={noop} />
            <Button label={sample('label')} variant="danger" icon="delete" onPress={noop} />
            <Button label={sample('label')} size="compact" onPress={noop} />
            <Button label={sample('disabled')} disabled onPress={noop} />
            <Button label={sample('loading')} loading onPress={noop} />
          </View>
        </Section>

        <Section section="textField">
          <View style={styles.column}>
            <TextField label={sample('label')} value={text} onChangeText={setText} />
            <TextField
              label={sample('label')}
              value={text}
              onChangeText={setText}
              hint={sample('hint')}
            />
            <TextField
              label={sample('label')}
              value={text}
              onChangeText={setText}
              error={sample('error')}
            />
            <TextField label={sample('label')} value={text} onChangeText={setText} multiline />
          </View>
        </Section>

        <Section section="searchField">
          <View style={styles.column}>
            <SearchField value={search} onChangeText={setSearch} placeholder={sample('search')} />
            <SearchField
              size="compact"
              value={search}
              onChangeText={setSearch}
              placeholder={sample('search')}
            />
          </View>
        </Section>

        <Section section="filterChip">
          <View style={styles.row}>
            <FilterChip label={sample('label')} selected={chip} onPress={() => setChip(!chip)} />
            <FilterChip
              label={units.icara.label}
              selected={!chip}
              dotColor={units.icara.dot}
              onPress={() => setChip(!chip)}
            />
            <FilterChip label={sample('label')} selected={false} icon="event" onPress={noop} />
          </View>
        </Section>

        <Section section="audiencePicker">
          <AudiencePicker unitId="icara" value={audience} onChange={setAudience} />
        </Section>

        <Section section="unitTag">
          <View style={styles.row}>
            {unitIds.map((id) => (
              <UnitTag key={id} unitId={id} />
            ))}
          </View>
        </Section>

        <Section section="statusTag">
          <View style={styles.row}>
            <StatusTag tone="neutral" label={sample('neutral')} />
            <StatusTag tone="info" label={sample('info')} />
            <StatusTag tone="success" label={sample('success')} />
            <StatusTag tone="warning" label={sample('warning')} />
          </View>
        </Section>

        <Section section="badge">
          <View style={styles.row}>
            <Badge count={5} />
            <Badge count={42} />
            <Badge count={150} />
          </View>
        </Section>

        <Section section="segmented">
          <View style={styles.column}>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: sample('month') },
                { value: 'week', label: sample('week'), count: 3 },
                { value: 'day', label: sample('day'), icon: 'event' },
              ]}
            />
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: sample('month') },
                { value: 'week', label: sample('week') },
              ]}
            />
          </View>
        </Section>

        <Section section="eventCard">
          <View style={styles.column}>
            <EventCard
              title={sample('title')}
              timeLabel={sample('time')}
              unitId="estaca"
              typeIcon="podium"
              place={sample('place')}
              onPress={noop}
            />
            <EventCard
              title={sample('title')}
              timeLabel={sample('time')}
              unitId="criciuma3"
              onPress={noop}
            />
          </View>
        </Section>

        <Section section="listItem">
          <View>
            <ListItem
              title={sample('name')}
              subtitle={sample('subtitle')}
              leading={{ kind: 'avatar', name: sample('name') }}
              trailing={{ kind: 'chevron' }}
              onPress={noop}
            />
            <ListItem
              title={sample('label')}
              leading={{ kind: 'icon', name: 'notifications' }}
              trailing={{
                kind: 'switch',
                value: enabled,
                onValueChange: setEnabled,
                label: sample('label'),
              }}
            />
            <ListItem
              title={units.icara.label}
              leading={{ kind: 'unitDot', unitId: 'icara' }}
              trailing={{ kind: 'count', text: '12' }}
              onPress={noop}
            />
          </View>
        </Section>

        <Section section="avatar">
          <View style={styles.row}>
            <Avatar name={sample('name')} size="small" />
            <Avatar name={sample('name')} />
            <Avatar name={sample('name')} size="large" />
          </View>
        </Section>

        <Section section="switch">
          <View style={styles.row}>
            <Switch label={sample('label')} value={enabled} onValueChange={setEnabled} />
            <Switch label={sample('label')} size="compact" value={!enabled} onValueChange={noop} />
            <Switch label={sample('disabled')} value disabled onValueChange={noop} />
          </View>
        </Section>

        <Section section="toast">
          <View style={styles.column}>
            <Button
              label={sample('open')}
              variant="secondary"
              onPress={() => toast.show({ message: sample('message') })}
            />
            <Button
              label={sample('undo')}
              variant="secondary"
              onPress={() =>
                toast.show({
                  message: sample('message'),
                  actionLabel: sample('undo'),
                  tone: 'success',
                })
              }
            />
          </View>
        </Section>

        <Section section="tabBar">
          <TabBar tabs={tabs} activeRoute={tab} onSelect={setTab} />
        </Section>

        <Section section="screenHeader">
          <View style={styles.column}>
            <ScreenHeader
              title={sample('title')}
              overline={sample('label')}
              actions={[{ icon: 'add', accessibilityLabel: sample('label'), onPress: noop }]}
            />
            <ScreenHeader
              title={sample('title')}
              onBack={noop}
              actions={[
                {
                  icon: 'tune',
                  accessibilityLabel: sample('label'),
                  onPress: noop,
                  tone: 'neutral',
                },
              ]}
            />
          </View>
        </Section>

        <Section section="sheet">
          <View style={styles.column}>
            <Button label={sample('open')} variant="outline" onPress={() => setSheet(true)} />
            <Button label={sample('delete')} variant="danger" onPress={() => setConfirm(true)} />
          </View>
        </Section>

        <Section section="emptyState">
          <View style={styles.column}>
            <EmptyState message={sample('hint')} />
            <EmptyState
              message={sample('hint')}
              icon="event"
              action={{ label: sample('open'), onPress: noop }}
            />
          </View>
        </Section>

        <Section section="offlineBanner">
          <OfflineBanner />
        </Section>

        <Section section="skeleton">
          <View style={styles.column}>
            <Skeleton width="100%" height={size.button} radius="card" />
            <Skeleton width="60%" height={size.icon} />
          </View>
        </Section>

        <Section section="icons">
          <View style={styles.iconGrid}>
            {iconNames.map((name) => (
              <View key={name} style={styles.iconCell}>
                <View style={styles.row}>
                  <Icon name={name} />
                  <Icon name={name} filled color={theme.primary} />
                </View>
                {/* The icon name is a technical identifier, not UI text. */}
                <Text style={styles.iconName}>{name}</Text>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel={sample('title')}>
        <Text style={styles.sectionTitle}>{sample('title')}</Text>
        <Button label={sample('confirm')} onPress={() => setSheet(false)} />
      </Sheet>
      <ConfirmSheet
        visible={confirm}
        title={sample('sheetTitle')}
        message={sample('sheetMessage')}
        confirmLabel={sample('delete')}
        cancelLabel={sample('keep')}
        confirmVariant="danger"
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: space.lg, gap: space.xl },
  title: { ...type.display, color: theme.heading },
  section: { gap: space.md },
  sectionTitle: { ...type.overline, color: theme.primary },
  column: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  iconCell: { width: '30%', gap: space.xs },
  iconName: { ...type.caption, color: theme.textMuted },
});
