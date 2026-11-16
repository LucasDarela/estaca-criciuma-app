import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ListItem } from '@/components/ListItem';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { Segmented } from '@/components/Segmented';
import { callingName, normalizeSearch } from '@/domain/callings';
import {
  bishopricCount,
  buildStakeTree,
  searchMembers,
  type OrgChartMember,
} from '@/domain/orgChart';
import { unitKind } from '@/domain/units';
import { useLocale } from '@/i18n/useLocale';
import { useIsOnline } from '@/lib/network';
import { space, theme, type, unitOrder, units } from '@/theme/theme';

import { useOrgChart } from './api';
import { PersonSheet } from './PersonSheet';
import { StakeTree } from './StakeTree';
import { TreeSkeleton } from './TreeSkeleton';

type Segment = 'stake' | 'units';

const noop = () => {};
const MIN_SEARCH_LENGTH = 2;

/** Aba Liderança: search, Estaca | Unidades, and the stake tree or the list of units (RF-14, RF-15). */
export function LeadershipScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const online = useIsOnline();
  const { members, links, status, refetch } = useOrgChart();

  const [segment, setSegment] = useState<Segment>('stake');
  const [term, setTerm] = useState('');
  const [person, setPerson] = useState<OrgChartMember | null>(null);

  const stakeTree = useMemo(() => buildStakeTree(members, links), [members, links]);
  const searching = normalizeSearch(term).length >= MIN_SEARCH_LENGTH;
  const results = searching ? searchMembers(members, term, locale) : [];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('leadership.title')} showAvatar />
      {!online && status === 'success' ? <OfflineBanner /> : null}
      <View style={styles.controls}>
        <SearchField
          size="compact"
          placeholder={t('leadership.search.placeholder')}
          value={term}
          onChangeText={setTerm}
        />
        <Segmented<Segment>
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'stake', label: t('leadership.segment.stake') },
            { value: 'units', label: t('leadership.segment.units') },
          ]}
        />
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {status === 'loading' ? (
          <TreeSkeleton />
        ) : status === 'error' || status === 'offline' ? (
          <View style={styles.message}>
            <EmptyState
              message={t(status === 'error' ? 'leadership.error' : 'leadership.offlineEmpty')}
              action={{ label: t('common.retry'), onPress: refetch }}
            />
          </View>
        ) : searching ? (
          results.length === 0 ? (
            <Text style={styles.noResults}>
              {t('leadership.search.empty', { term: term.trim() })}
            </Text>
          ) : (
            results.map((result) => (
              <ListItem
                key={result.memberCallId}
                leading={{ kind: 'avatar', name: result.displayName }}
                title={result.displayName}
                subtitle={t('leadership.person.subtitle', {
                  calling: callingName(result.calling, locale),
                  unit: units[result.unitId].label,
                })}
                onPress={() => setPerson(result)}
              />
            ))
          )
        ) : segment === 'stake' ? (
          <StakeTree
            tree={stakeTree}
            editing={false}
            onPersonPress={setPerson}
            onEditHighCouncilor={noop}
          />
        ) : (
          unitOrder
            .filter((id) => id !== 'estaca')
            .map((id) => (
              <ListItem
                key={id}
                leading={{ kind: 'unitDot', unitId: id }}
                title={units[id].label}
                subtitle={t('leadership.units.subtitle', {
                  group: t(
                    `leadership.units.main.${unitKind(id) === 'branch' ? 'branch' : 'ward'}`,
                  ),
                  count: bishopricCount(members, id),
                })}
                trailing={{ kind: 'chevron' }}
                onPress={() => router.push({ pathname: '/leadership/unit/[id]', params: { id } })}
              />
            ))
        )}
      </ScrollView>
      <PersonSheet person={person} links={links} onClose={() => setPerson(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surfaceMuted },
  controls: {
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: theme.surface,
  },
  body: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl },
  message: { paddingTop: space.xl },
  noResults: { ...type.body, color: theme.textMuted, textAlign: 'center', paddingTop: space.xl },
});
