import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useToast } from '@/components/toast/ToastProvider';
import { callingName, type MemberCall } from '@/domain/callings';
import { useLocale } from '@/i18n/useLocale';
import { elevation, radius, space, theme, type, units } from '@/theme/theme';

import { AccountError, setOrgChartConsent } from './api';

/**
 * RF-17: asks, one calling at a time (oldest grant first), whether the person's name and calling
 * appear on the public org chart. `calls` come ordered by `granted_at`.
 */
export function OrgChartConsentCard({ calls }: { calls: readonly MemberCall[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Answered callings disappear at once, before the viewer reload brings the new state.
  const [answered, setAnswered] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const pending = calls.find((c) => c.orgChartConsent === 'pending' && !answered.includes(c.id));
  if (!pending) return null;

  async function answer(accepted: boolean) {
    if (inFlight.current || !pending) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await setOrgChartConsent(pending.id, accepted);
      setAnswered((ids) => [...ids, pending.id]);
      await queryClient.invalidateQueries({ queryKey: ['viewer'] });
      if (accepted) toast.show({ message: t('callings.consent.shown'), tone: 'success' });
    } catch (thrown) {
      const network = thrown instanceof AccountError && thrown.code === 'network';
      toast.show({ message: t(network ? 'auth.errors.network' : 'common.genericError') });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.message}>
        {t('callings.consent.message', {
          calling: callingName(pending.calling, locale),
          unit: units[pending.unitId].label,
        })}
      </Text>
      <View style={styles.actions}>
        <Button
          size="compact"
          label={t('callings.consent.show')}
          disabled={busy}
          onPress={() => void answer(true)}
        />
        <Button
          size="compact"
          variant="ghost"
          label={t('callings.consent.notNow')}
          disabled={busy}
          onPress={() => void answer(false)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.sm,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: theme.surface,
    ...elevation[1],
  },
  message: { ...type.body, color: theme.textBody },
  actions: { flexDirection: 'row', gap: space.sm },
});
