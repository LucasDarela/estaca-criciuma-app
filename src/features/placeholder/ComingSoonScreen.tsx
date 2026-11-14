import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { space, theme } from '@/theme/theme';

/** Stand-in for a tab whose feature has no spec implemented yet (RF-20). */
export function ComingSoonScreen({ titleKey }: { titleKey: `tabs.${string}` }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t(titleKey)} showAvatar />
      <View style={styles.body}>
        <EmptyState message={t('common.comingSoon')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  body: { flex: 1, padding: space.lg, backgroundColor: theme.bg },
});
