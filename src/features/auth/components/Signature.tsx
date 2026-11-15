import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { space, theme, type } from '@/theme/theme';

/** Typographic logo: positive signature, name over place (spec section 8). */
export function Signature() {
  const { t } = useTranslation();
  return (
    <View style={styles.root} accessibilityRole="header">
      <Text style={styles.name}>{t('auth.signature.name')}</Text>
      <Text style={styles.tagline}>{t('auth.signature.tagline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  name: { ...type.signatureName, color: theme.primary },
  tagline: { ...type.signatureTagline, color: theme.textMuted },
});
