import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { buildUnitTree, type LinkOrganization, type OrgChartMember } from '@/domain/orgChart';
import { canLead } from '@/domain/permissions';
import { isUnitId, unitKind, type UnitId } from '@/domain/units';
import { useIsOnline } from '@/lib/network';
import { space, theme, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { useOrgChart } from './api';
import { EditBanner } from './EditBanner';
import { OrgCounselorSheet } from './OrgCounselorSheet';
import { PersonSheet } from './PersonSheet';
import { TreeSkeleton } from './TreeSkeleton';
import { UnitTree } from './UnitTree';

/** `/leadership/unit/[id]`: the tree of a ward or branch (RF-16, RF-12). */
export function UnitLeadershipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!isUnitId(id) || unitKind(id) === 'stake') return <UnitNotFound />;
  return <UnitContent unitId={id} />;
}

function UnitNotFound() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('leadership.title')} onBack={() => router.replace('/leadership')} />
      <View style={styles.message}>
        <EmptyState
          icon="account_tree"
          message={t('leadership.unit.notFound')}
          action={{
            label: t('leadership.unit.back'),
            onPress: () => router.replace('/leadership'),
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function UnitContent({ unitId }: { unitId: UnitId }) {
  const { t } = useTranslation();
  const router = useRouter();
  const online = useIsOnline();
  const viewer = useViewer();
  const { members, links, status, refetch, refetchLinks } = useOrgChart();
  const [person, setPerson] = useState<OrgChartMember | null>(null);
  const [editing, setEditing] = useState(false);
  const [organization, setOrganization] = useState<LinkOrganization | null>(null);

  const tree = useMemo(
    () => buildUnitTree(unitId, members, links, { editing }),
    [unitId, members, links, editing],
  );
  const canEdit = canLead(viewer.memberships, unitId) && status === 'success';
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/leadership'));

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={units[unitId].label}
        onBack={goBack}
        actions={
          canEdit && !editing
            ? [
                {
                  icon: 'edit',
                  accessibilityLabel: online
                    ? t('leadership.edit.button')
                    : t('leadership.edit.offline'),
                  disabled: !online,
                  onPress: () => setEditing(true),
                },
              ]
            : undefined
        }
      />
      {editing ? (
        <EditBanner
          onDone={() => {
            setEditing(false);
            void refetchLinks();
          }}
        />
      ) : null}
      {!online && status === 'success' ? <OfflineBanner /> : null}
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {status === 'loading' ? (
          <TreeSkeleton />
        ) : status === 'error' || status === 'offline' ? (
          <View style={styles.message}>
            <EmptyState
              message={t(status === 'error' ? 'leadership.error' : 'leadership.offlineEmpty')}
              action={{ label: t('common.retry'), onPress: refetch }}
            />
          </View>
        ) : (
          <UnitTree
            tree={tree}
            editing={editing}
            onPersonPress={setPerson}
            onEditOrganization={setOrganization}
          />
        )}
      </ScrollView>
      <PersonSheet person={person} links={links} onClose={() => setPerson(null)} />
      <OrgCounselorSheet
        unitId={unitId}
        organization={organization}
        links={links}
        onSaved={() => void refetchLinks()}
        onClose={() => setOrganization(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surfaceMuted },
  body: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl },
  message: { padding: space.lg, paddingTop: space.xl },
});
