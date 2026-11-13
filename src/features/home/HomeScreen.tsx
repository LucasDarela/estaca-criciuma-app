import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { space, theme, type } from '@/theme/theme';

// Temporary home: the stake signature (inverted, as on the splash) until the
// Agenda feature replaces this route with the tab navigator.
export function HomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.signature}>
        <Text accessibilityRole="header" style={styles.name}>
          Estaca Criciúma
        </Text>
        <Text style={styles.region}>{t('home.region')}</Text>
      </View>
      <Text style={styles.comingSoon}>{t('home.comingSoon')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    gap: space.xl,
  },
  signature: { alignItems: 'center', gap: space.xs },
  name: { ...type.display, color: theme.onPrimary },
  region: { ...type.overline, color: theme.onPrimaryMuted, letterSpacing: 2.4 },
  comingSoon: { ...type.body, color: theme.onPrimaryMuted, textAlign: 'center' },
});
