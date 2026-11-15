import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { ListItem } from '@/components/ListItem';
import { useToast } from '@/components/toast/ToastProvider';
import { callingName, type MemberCall } from '@/domain/callings';
import { useLocale } from '@/i18n/useLocale';
import { space, theme, type, units } from '@/theme/theme';

import { AccountError, setOrgChartConsent } from './api';

/** RF-16: the person's callings, with the org chart switch on the ones that have a section. */
export function MyCallingsSection({ calls }: { calls: readonly MemberCall[] }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(false);

  if (calls.length === 0) return null;

  async function toggle(call: MemberCall, accepted: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await setOrgChartConsent(call.id, accepted);
      await queryClient.invalidateQueries({ queryKey: ['viewer'] });
    } catch (thrown) {
      const network = thrown instanceof AccountError && thrown.code === 'network';
      toast.show({ message: t(network ? 'auth.errors.network' : 'common.genericError') });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.overline}>
        {t('callings.mine.title')}
      </Text>
      {calls.map((call) => {
        const name = callingName(call.calling, locale);
        const unit = units[call.unitId].label;
        const hasSection = call.calling.orgChartSection !== null;
        return (
          <ListItem
            key={call.id}
            title={name}
            subtitle={hasSection ? `${unit} · ${t('callings.mine.showInOrgChart')}` : unit}
            trailing={
              hasSection
                ? {
                    kind: 'switch',
                    value: call.orgChartConsent === 'accepted',
                    onValueChange: (value) => void toggle(call, value),
                    label: t('callings.mine.showInOrgChartA11y', { calling: name }),
                  }
                : undefined
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xl, paddingBottom: space.md },
  overline: { ...type.overline, color: theme.primary, paddingBottom: space.xs },
});
