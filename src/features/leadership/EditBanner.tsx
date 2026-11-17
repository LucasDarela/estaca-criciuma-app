import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { space, theme, type } from '@/theme/theme';

/** RF-23: the strip shown while editing, with the Concluir button. */
export function EditBanner({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('leadership.edit.banner')}</Text>
      <Button variant="ghost" size="compact" label={t('leadership.edit.done')} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: theme.primarySubtle,
  },
  text: { ...type.callout, color: theme.primary },
});
