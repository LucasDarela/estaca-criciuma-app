import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import { ListItem } from '@/components/ListItem';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useToast } from '@/components/toast/ToastProvider';
import { canManageAccess } from '@/domain/access';
import { callingName } from '@/domain/callings';
import { useLocale } from '@/i18n/useLocale';
import { space, stroke, theme, type, unitOrder, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import {
  AccountError,
  accessQueryKey,
  listAccess,
  revokeAdmin,
  revokeCalling,
  type AccessEntry,
} from './api';
import { GrantAccessSheet } from './GrantAccessSheet';

export function AccessScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const locale = useLocale();
  const viewer = useViewer();
  const allowed = canManageAccess(viewer.memberships);
  const [revoking, setRevoking] = useState<AccessEntry | null>(null);
  const [granting, setGranting] = useState(false);

  // No call at all without permission (the RPC would answer not_authorized anyway).
  const query = useQuery({ queryKey: accessQueryKey, queryFn: listAccess, enabled: allowed });

  const sections = useMemo(
    () =>
      unitOrder
        .map((unitId) => ({
          unitId,
          title: units[unitId].label,
          data: (query.data ?? []).filter((entry) => entry.unitId === unitId),
        }))
        .filter((section) => section.data.length > 0),
    [query.data],
  );

  /** The calling name in the interface language, or "Administração". */
  function labelOf(entry: AccessEntry): string {
    return entry.calling ? callingName(entry.calling, locale) : t('account.access.admin');
  }

  function select(entry: AccessEntry) {
    if (entry.userId === viewer.userId) {
      toast.show({ message: t('account.access.cannotRevokeSelf') });
      return;
    }
    setRevoking(entry);
  }

  async function confirmRevoke() {
    const entry = revoking;
    if (!entry) return;
    setRevoking(null);
    try {
      if (entry.kind === 'admin') await revokeAdmin(entry.userId);
      else await revokeCalling(entry.entryId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accessQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['viewer'] }),
      ]);
      toast.show({ message: t('account.access.revoked'), tone: 'success' });
    } catch (thrown) {
      const code = thrown instanceof AccountError ? thrown.code : 'unknown';
      toast.show({
        message: t(
          code === 'cannot_revoke_self'
            ? 'account.access.cannotRevokeSelf'
            : code === 'network'
              ? 'auth.errors.network'
              : 'common.genericError',
        ),
      });
    }
  }

  if (!allowed) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScreenHeader title={t('account.access.title')} onBack={() => router.back()} />
        <View style={styles.body}>
          <EmptyState icon="lock" message={t('account.access.restricted')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScreenHeader title={t('account.access.title')} onBack={() => router.back()} />
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
      ) : (
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={sections}
          keyExtractor={(entry) => `${entry.kind}-${entry.entryId}`}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" style={styles.section}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <ListItem
              leading={{ kind: 'avatar', name: item.displayName }}
              title={item.displayName}
              subtitle={`${item.email} · ${labelOf(item)}`}
              accessibilityLabel={t('account.access.itemA11y', {
                name: item.displayName,
                calling: labelOf(item),
                unit: units[item.unitId].label,
              })}
              onPress={() => select(item)}
            />
          )}
        />
      )}
      <View style={styles.footer}>
        <Button label={t('account.access.grant')} onPress={() => setGranting(true)} />
      </View>

      <ConfirmSheet
        visible={revoking !== null}
        title={t('account.access.revokeTitle')}
        message={
          revoking
            ? t('account.access.revokeMessage', {
                name: revoking.displayName,
                calling: labelOf(revoking),
                unit: units[revoking.unitId].label,
              })
            : ''
        }
        confirmLabel={t('account.access.revoke')}
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevoking(null)}
      />
      <GrantAccessSheet visible={granting} onClose={() => setGranting(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  body: { flex: 1, padding: space.lg, backgroundColor: theme.bg, justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  section: {
    ...type.overline,
    color: theme.primary,
    paddingTop: space.xl,
    paddingBottom: space.xs,
  },
  footer: {
    padding: space.lg,
    backgroundColor: theme.surface,
    borderTopWidth: stroke.hairline,
    borderTopColor: theme.border,
  },
});
