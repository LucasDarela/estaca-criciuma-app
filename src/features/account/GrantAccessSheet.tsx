import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/Button';
import { FilterChip } from '@/components/FilterChip';
import { ListItem } from '@/components/ListItem';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import { callingName } from '@/domain/callings';
import { EMAIL_MAX_LENGTH, validateEmail } from '@/domain/email';
import { isAdmin } from '@/domain/permissions';
import { STAKE_UNIT_ID, type UnitId } from '@/domain/units';
import { useLocale } from '@/i18n/useLocale';
import { space, theme, type, unitOrder, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import {
  AccountError,
  accessQueryKey,
  callingCatalogQueryKey,
  fetchCallingCatalog,
  grantAdmin,
  grantCalling,
} from './api';
import { CallingPickerSheet } from './CallingPickerSheet';

export type GrantAccessSheetProps = { visible: boolean; onClose: () => void };

/** RF-13: e-mail, unit and calling; the database revalidates everything. */
export function GrantAccessSheet({ visible, onClose }: GrantAccessSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('account.access.grant')}>
      {/* Mounted only while open, so every opening starts with an empty form. */}
      {visible ? <GrantAccessForm onClose={onClose} /> : null}
    </Sheet>
  );
}

function GrantAccessForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { memberships } = useViewer();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [unit, setUnit] = useState<UnitId | null>(null);
  // A calling id, or 'admin' for "Administração" (only offered to the admin).
  const [choice, setChoice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const catalog = useQuery({ queryKey: callingCatalogQueryKey, queryFn: fetchCallingCatalog });
  const admin = isAdmin(memberships);

  const chosenLabel =
    choice === 'admin'
      ? t('account.access.admin')
      : choice
        ? (() => {
            const found = (catalog.data ?? []).find((c) => c.id === choice);
            return found ? callingName(found, locale) : null;
          })()
        : null;

  function chooseUnit(next: UnitId) {
    setUnit(next);
    // The chosen calling stops being valid when the unit changes.
    setChoice(null);
  }

  async function submit() {
    if (inFlight.current || !unit || !choice) return;
    const problem = validateEmail(email);
    if (problem) {
      setEmailError(
        t(problem === 'required' ? 'auth.errors.emailRequired' : 'auth.errors.emailInvalid'),
      );
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      if (choice === 'admin') await grantAdmin(email);
      else await grantCalling({ email, unitId: unit, callingId: choice });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accessQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['viewer'] }),
      ]);
      onClose();
      toast.show({ message: t('account.access.granted'), tone: 'success' });
    } catch (thrown) {
      const code = thrown instanceof AccountError ? thrown.code : 'unknown';
      if (code === 'no_account') setEmailError(t('account.access.noAccount'));
      else if (code === 'already_granted') setEmailError(t('account.access.alreadyGranted'));
      else if (code === 'no_home_unit') setEmailError(t('account.access.noHomeUnit'));
      else if (code === 'wrong_unit') setEmailError(t('account.access.wrongUnit'));
      else
        toast.show({
          message: t(code === 'network' ? 'auth.errors.network' : 'common.genericError'),
        });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ maxHeight: height * 0.7 }} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('account.access.grant')}
        </Text>
        <TextField
          label={t('account.access.email')}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(undefined);
          }}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={EMAIL_MAX_LENGTH}
        />

        <Text style={styles.label}>{t('account.access.unit')}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('account.access.unit')}
          style={styles.chips}
        >
          {unitOrder.map((id) => (
            <FilterChip
              key={id}
              label={units[id].label}
              dotColor={units[id].dot}
              selected={unit === id}
              onPress={() => chooseUnit(id)}
            />
          ))}
        </View>

        {unit ? (
          <ListItem
            title={t('account.access.calling')}
            subtitle={chosenLabel ?? t('account.access.callingPlaceholder')}
            trailing={{ kind: 'chevron' }}
            onPress={() => setPicking(true)}
          />
        ) : null}

        <Button
          label={t('account.access.submit')}
          loading={loading}
          disabled={email.trim() === '' || unit === null || choice === null}
          onPress={() => void submit()}
        />
      </View>

      {unit ? (
        <CallingPickerSheet
          visible={picking}
          unitId={unit}
          catalog={catalog.data ?? []}
          includeAdmin={admin && unit === STAKE_UNIT_ID}
          onSelect={(id) => {
            setChoice(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  label: { ...type.fieldLabel, color: theme.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
