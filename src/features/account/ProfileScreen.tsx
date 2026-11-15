import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ListItem } from '@/components/ListItem';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UnitPickerSheet } from '@/components/UnitPickerSheet';
import { pressedStyle } from '@/components/pressable';
import { useToast } from '@/components/toast/ToastProvider';
import { canManageAccess } from '@/domain/access';
import type { Locale } from '@/domain/profile';
import type { UnitId } from '@/domain/units';
import { signOut, useAuthSession } from '@/lib/authSession';
import { privacyUrl } from '@/lib/config';
import { size, space, theme, type, unitOrder, units } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { AccountError, exportMyData, updateProfile } from './api';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import { EditNameSheet } from './EditNameSheet';
import { LanguageSheet } from './LanguageSheet';

const selectableUnits = unitOrder.filter((id) => id !== 'estaca');

type Open = 'name' | 'unit' | 'language' | 'delete' | null;

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const auth = useAuthSession();
  const viewer = useViewer();
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const privacy = privacyUrl();

  const userId = viewer.userId;
  const profile = viewer.profile;
  if (userId === null) return null;

  const email = auth.status === 'signedIn' ? auth.email : '';
  const name = profile?.displayName ?? '';
  const unit = profile?.homeUnitId ?? null;
  const locale = profile?.locale ?? 'pt-BR';

  async function save(patch: Parameters<typeof updateProfile>[1], toastMessage = true) {
    setSaving(true);
    try {
      await updateProfile(userId as string, patch);
      await queryClient.invalidateQueries({ queryKey: ['viewer'] });
      if (toastMessage) toast.show({ message: t('account.profile.updated'), tone: 'success' });
      setOpen(null);
    } catch {
      toast.show({ message: t('common.genericError') });
    } finally {
      setSaving(false);
    }
  }

  async function chooseLocale(next: Locale) {
    setOpen(null);
    await i18n.changeLanguage(next);
    await save({ locale: next }, false);
  }

  async function runExport() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportMyData();
    } catch (thrown) {
      const network = thrown instanceof AccountError && thrown.code === 'network';
      toast.show({ message: t(network ? 'auth.errors.network' : 'common.genericError') });
    } finally {
      setExporting(false);
    }
  }

  async function leave() {
    await signOut();
    router.replace('/agenda');
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('account.profile.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Avatar name={name} size="large" />
          <View style={styles.identityText}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.email}>{email}</Text>
          </View>
        </View>

        <ListItem
          title={t('account.profile.name')}
          subtitle={name}
          trailing={{ kind: 'chevron' }}
          onPress={() => setOpen('name')}
        />
        <ListItem
          title={t('account.profile.unit')}
          subtitle={unit ? units[unit].label : t('account.profile.unitNone')}
          trailing={{ kind: 'chevron' }}
          onPress={() => setOpen('unit')}
        />
        <ListItem
          title={t('account.profile.language')}
          subtitle={t(`account.languages.${locale}`)}
          trailing={{ kind: 'chevron' }}
          onPress={() => setOpen('language')}
        />
        {canManageAccess(viewer.memberships) ? (
          <ListItem
            title={t('account.profile.access')}
            trailing={{ kind: 'chevron' }}
            onPress={() => router.push('/profile/access')}
          />
        ) : null}
        <ListItem
          title={t('account.profile.export')}
          trailing={exporting ? { kind: 'loading' } : { kind: 'chevron' }}
          onPress={() => void runExport()}
        />
        {privacy ? (
          <ListItem
            title={t('account.profile.privacy')}
            trailing={{ kind: 'chevron' }}
            onPress={() => void Linking.openURL(privacy)}
          />
        ) : null}
        <ListItem
          title={t('account.profile.signOut')}
          trailing={{ kind: 'chevron' }}
          onPress={() => void leave()}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('account.profile.delete')}
          onPress={() => setOpen('delete')}
          style={(state) => [styles.delete, pressedStyle(state)]}
        >
          <Text style={styles.deleteText}>{t('account.profile.delete')}</Text>
        </Pressable>
      </ScrollView>

      <EditNameSheet
        visible={open === 'name'}
        initialName={name}
        loading={saving}
        onSave={(next) => void save({ displayName: next })}
        onClose={() => setOpen(null)}
      />
      <UnitPickerSheet
        visible={open === 'unit'}
        title={t('account.profile.unit')}
        noneLabel={t('account.profile.unitNone')}
        value={unit}
        units={selectableUnits}
        onSelect={(next: UnitId | null) => void save({ homeUnitId: next })}
        onClose={() => setOpen(null)}
      />
      <LanguageSheet
        visible={open === 'language'}
        value={locale}
        onSelect={(next) => void chooseLocale(next)}
        onClose={() => setOpen(null)}
      />
      <DeleteAccountSheet visible={open === 'delete'} onClose={() => setOpen(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.xl,
  },
  identityText: { flex: 1, gap: space.xs / 2 },
  name: { ...type.headline, color: theme.heading },
  email: { ...type.caption, color: theme.textMuted },
  delete: { minHeight: size.touchMinIos, justifyContent: 'center', marginTop: space.xl },
  deleteText: { ...type.listTitle, color: theme.danger },
});
