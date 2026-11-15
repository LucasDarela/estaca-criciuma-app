import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ListItem } from '@/components/ListItem';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { Segmented } from '@/components/Segmented';
import { callingName, matchesCalling, type Calling } from '@/domain/callings';
import { isAdmin } from '@/domain/permissions';
import { useLocale } from '@/i18n/useLocale';
import { space, theme, type } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { callingCatalogQueryKey, fetchCallingCatalog } from './api';

type Tab = 'stake' | 'units';

/** RF-20: the admin's list of callings, with search and a Estaca / Alas e ramo switch. */
export function CallingsCatalogScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const viewer = useViewer();
  const allowed = isAdmin(viewer.memberships);
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState<Tab>('stake');

  // No call at all without permission.
  const query = useQuery({
    queryKey: callingCatalogQueryKey,
    queryFn: fetchCallingCatalog,
    enabled: allowed,
  });

  const rows = useMemo(() => {
    const inTab = (query.data ?? []).filter(
      (calling) =>
        (calling.level === 'stake') === (tab === 'stake') && matchesCalling(calling, term),
    );
    // By sort order; the inactive ones go to the end.
    return inTab.sort((a, b) => Number(!a.active) - Number(!b.active) || a.sortOrder - b.sortOrder);
  }, [query.data, tab, term]);

  if (!allowed) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScreenHeader title={t('callings.catalog.title')} onBack={() => router.back()} />
        <View style={styles.body}>
          <EmptyState icon="lock" message={t('account.access.restricted')} />
        </View>
      </SafeAreaView>
    );
  }

  function subtitleOf(calling: Calling): string {
    return `${t(`callings.levels.${calling.level}`)} · ${t(`callings.access.${calling.access}`)}`;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScreenHeader
        title={t('callings.catalog.title')}
        onBack={() => router.back()}
        actions={[
          {
            icon: 'add',
            accessibilityLabel: t('callings.catalog.new'),
            onPress: () => router.push('/profile/callings-catalog/new'),
          },
        ]}
      />
      <View style={styles.filters}>
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder={t('callings.catalog.search')}
        />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stake', label: t('callings.catalog.tabStake') },
            { value: 'units', label: t('callings.catalog.tabUnits') },
          ]}
        />
      </View>
      {query.isPending ? (
        <View style={styles.body}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : query.isError ? (
        <View style={styles.body}>
          <EmptyState
            message={t('common.genericError')}
            action={{ label: t('common.retry'), onPress: () => void query.refetch() }}
          />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('callings.catalog.empty', { term: term.trim() })}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(calling) => calling.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ListItem
              title={callingName(item, locale)}
              subtitle={subtitleOf(item)}
              status={
                item.active ? undefined : { tone: 'neutral', label: t('callings.catalog.inactive') }
              }
              trailing={{ kind: 'chevron' }}
              onPress={() => router.push(`/profile/callings-catalog/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  body: { flex: 1, padding: space.lg, backgroundColor: theme.bg, justifyContent: 'center' },
  filters: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  empty: { padding: space.lg },
  emptyText: { ...type.body, color: theme.textMuted, textAlign: 'center' },
});
