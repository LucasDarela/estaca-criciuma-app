import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { registerDevice, requestPushPermission } from '@/lib/push';
import { space, theme, type } from '@/theme/theme';

export type EnablePushSheetProps = { visible: boolean; onClose: () => void };

/** RF-05: "Receber avisos?" after the welcome. Confirming asks the system and registers the token. */
export function EnablePushSheet({ visible, onClose }: EnablePushSheetProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setLoading(true);
    try {
      if ((await requestPushPermission()) === 'granted') await registerDevice({ force: true });
    } finally {
      setLoading(false);
      onClose();
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('push.enable.title')}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('push.enable.title')}
        </Text>
        <Text style={styles.message}>{t('push.enable.body')}</Text>
        <Button label={t('push.enable.confirm')} loading={loading} onPress={() => void confirm()} />
        <Button variant="ghost" label={t('push.enable.later')} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  message: { ...type.body, color: theme.textBody },
});
