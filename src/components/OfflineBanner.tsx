import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { space, theme, type } from '@/theme/theme';

export function OfflineBanner() {
  const { t } = useTranslation();
  return (
    <View accessible accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.text}>{t('common.offline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    backgroundColor: theme.warningSubtle,
  },
  text: { ...type.caption, color: theme.warningText, textAlign: 'center' },
});
