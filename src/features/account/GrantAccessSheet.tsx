import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/Button';
import { FilterChip } from '@/components/FilterChip';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import { grantableRoles, groupsFor } from '@/domain/access';
import { EMAIL_MAX_LENGTH, validateEmail } from '@/domain/email';
import type { LeadershipGroup, Role } from '@/domain/permissions';
import type { UnitId } from '@/domain/units';
import { space, theme, type, unitOrder, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { AccountError, accessQueryKey, grantRole } from './api';

export type GrantAccessSheetProps = { visible: boolean; onClose: () => void };

/** RF-16: e-mail, unit, role and leadership group; the database revalidates everything. */
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
  const { memberships } = useViewer();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [unit, setUnit] = useState<UnitId | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [group, setGroup] = useState<LeadershipGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const roles = unit ? grantableRoles(memberships, unit) : [];
  const groups = unit ? groupsFor(unit) : [];

  function chooseUnit(next: UnitId) {
    setUnit(next);
    // Drop the role and group that stop being valid for the new unit.
    if (role && !grantableRoles(memberships, next).includes(role)) setRole(null);
    if (group && !groupsFor(next).includes(group)) setGroup(null);
  }

  async function submit() {
    if (inFlight.current || !unit || !role) return;
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
      await grantRole({ email, unitId: unit, role, leadershipGroup: group });
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
        <View style={styles.chips}>
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

        <Text style={styles.label}>{t('account.access.role')}</Text>
        <View style={styles.chips}>
          {roles.map((value) => (
            <FilterChip
              key={value}
              label={t(`account.roles.${value}`)}
              selected={role === value}
              onPress={() => setRole(value)}
            />
          ))}
        </View>

        <Text style={styles.label}>{t('account.access.group')}</Text>
        <View style={styles.chips}>
          {groups.map((value) => (
            <FilterChip
              key={value ?? 'none'}
              label={t(`account.groups.${value ?? 'none'}`)}
              selected={group === value}
              onPress={() => setGroup(value)}
            />
          ))}
        </View>

        <Button
          label={t('account.access.submit')}
          loading={loading}
          disabled={email.trim() === '' || unit === null || role === null}
          onPress={() => void submit()}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  label: { ...type.fieldLabel, color: theme.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
