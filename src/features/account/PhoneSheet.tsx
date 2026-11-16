import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ListItem } from '@/components/ListItem';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import { digitsFromE164, isValidPhoneDigits, maskPhone, phoneDigits, toE164 } from '@/domain/phone';
import { space, theme, type } from '@/theme/theme';

import { AccountError, myPhoneQueryKey, setMyPhone, type MyPhone } from './api';

export type PhoneSheetProps = {
  visible: boolean;
  current: MyPhone | null;
  userId: string;
  onClose: () => void;
};

/** RF-21, RF-22: the person's own phone and whether it shows in the org chart. */
export function PhoneSheet({ visible, onClose, ...form }: PhoneSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('account.phone.title')}>
      {/* Mounted only while open, so the field restarts from the saved phone each time. */}
      {visible ? <PhoneForm {...form} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PhoneForm({
  current,
  userId,
  onClose,
}: Pick<PhoneSheetProps, 'current' | 'userId' | 'onClose'>) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [digits, setDigits] = useState(current ? digitsFromE164(current.phoneE164) : '');
  const [show, setShow] = useState(current?.showOnOrgChart ?? false);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function run(phone: string | null, shown: boolean, message: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      await setMyPhone(phone, shown);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: myPhoneQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['leadership', 'phones'] }),
      ]);
      toast.show({ message, tone: 'success' });
      onClose();
    } catch (thrown) {
      const code = thrown instanceof AccountError ? thrown.code : 'unknown';
      if (code === 'invalid_phone') setError(t('account.phone.invalid'));
      else
        toast.show({
          message: t(code === 'network' ? 'auth.errors.network' : 'common.genericError'),
        });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  function remove() {
    void run(null, false, t('account.phone.removed'));
  }

  function save() {
    if (digits === '') {
      if (show) {
        setError(t('account.phone.required'));
      } else if (current) {
        remove();
      } else {
        onClose();
      }
      return;
    }
    if (!isValidPhoneDigits(digits)) {
      setError(t('account.phone.invalid'));
      return;
    }
    void run(toE164(digits), show, t('account.phone.saved'));
  }

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('account.phone.title')}
      </Text>
      <TextField
        label={t('account.phone.label')}
        placeholder={t('account.phone.placeholder')}
        value={maskPhone(digits)}
        onChangeText={(value) => {
          setDigits(phoneDigits(value));
          setError(undefined);
        }}
        error={error}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <ListItem
        title={t('account.phone.show')}
        trailing={{
          kind: 'switch',
          value: show,
          onValueChange: (value) => {
            setShow(value);
            setError(undefined);
          },
          label: t('account.phone.show'),
        }}
      />
      <Text style={styles.help}>{t('account.phone.help')}</Text>
      <Button label={t('account.phone.save')} loading={loading} onPress={save} />
      {current ? (
        <Button
          variant="ghost"
          label={t('account.phone.remove')}
          disabled={loading}
          onPress={remove}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  help: { ...type.caption, color: theme.textMuted },
});
