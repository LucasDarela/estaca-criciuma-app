import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import { space, theme, type } from '@/theme/theme';

import { AccountError, deleteMyAccount } from './api';

export type DeleteAccountSheetProps = { visible: boolean; onClose: () => void };

/** RF-14: the button only enables with the exact confirmation word of the active language. */
export function DeleteAccountSheet({ visible, onClose }: DeleteAccountSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const confirmed = text === t('account.delete.confirmWord');

  async function submit() {
    if (!confirmed || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(undefined);
    try {
      await deleteMyAccount();
      onClose();
      router.replace('/agenda');
      toast.show({ message: t('account.delete.done'), tone: 'success' });
    } catch (thrown) {
      const code = thrown instanceof AccountError ? thrown.code : 'unknown';
      if (code === 'last_admin') setError(t('account.delete.lastAdmin'));
      else
        toast.show({
          message: t(code === 'network' ? 'auth.errors.network' : 'common.genericError'),
        });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  function close() {
    setText('');
    setError(undefined);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close} accessibilityLabel={t('account.delete.title')}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('account.delete.title')}
        </Text>
        <Text style={styles.message}>{t('account.delete.message')}</Text>
        <TextField
          label={t('account.delete.inputLabel')}
          value={text}
          onChangeText={setText}
          error={error}
          autoCapitalize="characters"
        />
        <Button
          variant="danger"
          label={t('account.delete.submit')}
          loading={loading}
          disabled={!confirmed}
          onPress={() => void submit()}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  message: { ...type.body, color: theme.textBody },
});
