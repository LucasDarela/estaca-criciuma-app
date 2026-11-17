import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { space } from '@/theme/theme';

import type { OrgChartData } from './api';
import { TreeSkeleton } from './TreeSkeleton';

/** RF-20, CA-30: skeleton, error or offline message with retry, else the children. */
export function OrgChartBody({
  status,
  onRetry,
  children,
}: {
  status: OrgChartData['status'];
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (status === 'loading') return <TreeSkeleton />;
  if (status === 'error' || status === 'offline') {
    return (
      <View style={styles.message}>
        <EmptyState
          message={t(status === 'error' ? 'leadership.error' : 'leadership.offlineEmpty')}
          action={{ label: t('common.retry'), onPress: onRetry }}
        />
      </View>
    );
  }
  return children;
}

const styles = StyleSheet.create({
  message: { paddingTop: space.xl },
});
