import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '@/components/FilterChip';
import { ListItem } from '@/components/ListItem';
import { useToast } from '@/components/toast/ToastProvider';
import { organizations, type Organization } from '@/domain/profile';
import { space, theme, type } from '@/theme/theme';

import { updateProfile } from './api';

export type NoticesSectionProps = { userId: string; organizations: readonly Organization[] };

/** RF-21. Profile › Avisos: the notifications history and the groups the person follows. */
export function NoticesSection({ userId, organizations: current }: NoticesSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  // Shown at once; dropped when the saved profile comes back, or on failure (back to the old state).
  const [optimistic, setOptimistic] = useState<Organization[] | null>(null);
  const selected = optimistic ?? current;

  async function toggle(organization: Organization) {
    const next = organizations.filter((o) =>
      o === organization ? !selected.includes(o) : selected.includes(o),
    );
    setOptimistic(next);
    try {
      await updateProfile(userId, { organizations: next });
      await queryClient.invalidateQueries({ queryKey: ['viewer'] });
    } catch {
      toast.show({ message: t('common.genericError') });
    } finally {
      setOptimistic(null);
    }
  }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.overline}>
        {t('account.profile.notices')}
      </Text>
      <ListItem
        title={t('account.profile.noticesHistory')}
        trailing={{ kind: 'chevron' }}
        onPress={() => router.push('/notifications')}
      />
      <Text style={styles.groupsTitle}>{t('account.profile.groups')}</Text>
      <View style={styles.chips}>
        {organizations.map((organization) => (
          <FilterChip
            key={organization}
            compact
            label={t(`push.audience.organizations.${organization}`)}
            selected={selected.includes(organization)}
            onPress={() => void toggle(organization)}
          />
        ))}
      </View>
      <Text style={styles.hint}>{t('account.profile.groupsHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.xl, paddingBottom: space.md, gap: space.sm },
  overline: { ...type.overline, color: theme.primary, paddingBottom: space.xs },
  groupsTitle: { ...type.callout, color: theme.text, paddingTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { ...type.caption, color: theme.textMuted },
});
