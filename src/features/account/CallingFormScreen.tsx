import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { EmptyState } from '@/components/EmptyState';
import { FilterChip } from '@/components/FilterChip';
import { ListItem } from '@/components/ListItem';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/toast/ToastProvider';
import {
  accessesForLevel,
  callingLevels,
  notifyGroups,
  sectionsForLevel,
  type Calling,
  type CallingAccess,
  type CallingLevel,
  type NotifyGroup,
  type OrgChartSection,
} from '@/domain/callings';
import { isAdmin } from '@/domain/permissions';
import { space, theme, type } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import {
  AccountError,
  callingCatalogQueryKey,
  callingHolderCount,
  fetchCallingCatalog,
  saveCalling,
} from './api';

const NAME_MIN = 2;
const NAME_MAX = 80;

type FormState = {
  namePt: string;
  nameEn: string;
  nameEs: string;
  level: CallingLevel;
  access: CallingAccess;
  notifyGroup: NotifyGroup | null;
  orgChartSection: OrgChartSection | null;
  active: boolean;
};

const emptyForm: FormState = {
  namePt: '',
  nameEn: '',
  nameEs: '',
  level: 'stake',
  access: 'none',
  notifyGroup: null,
  orgChartSection: null,
  active: true,
};

function formOf(calling: Calling): FormState {
  return {
    namePt: calling.namePt,
    nameEn: calling.nameEn ?? '',
    nameEs: calling.nameEs ?? '',
    level: calling.level,
    access: calling.access,
    notifyGroup: calling.notifyGroup,
    orgChartSection: calling.orgChartSection,
    active: calling.active,
  };
}

/** RF-21, RF-22: create (`id = 'new'`) or edit a calling of the catalog. Admin only. */
export function CallingFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const viewer = useViewer();
  const { id } = useLocalSearchParams<{ id: string }>();
  const allowed = isAdmin(viewer.memberships);
  const isNew = id === 'new';

  const query = useQuery({
    queryKey: callingCatalogQueryKey,
    queryFn: fetchCallingCatalog,
    enabled: allowed && !isNew,
  });
  const existing = isNew ? null : ((query.data ?? []).find((c) => c.id === id) ?? null);

  const header = (
    <ScreenHeader
      title={isNew ? t('callings.catalog.new') : t('callings.catalog.title')}
      onBack={() => router.back()}
    />
  );

  if (!allowed) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        {header}
        <View style={styles.body}>
          <EmptyState icon="lock" message={t('account.access.restricted')} />
        </View>
      </SafeAreaView>
    );
  }
  if (!isNew && query.isPending) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        {header}
        <View style={styles.body}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!isNew && existing === null) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        {header}
        <View style={styles.body}>
          <EmptyState
            message={t('common.genericError')}
            action={{ label: t('common.retry'), onPress: () => void query.refetch() }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      {header}
      <CallingForm existing={existing} />
    </SafeAreaView>
  );
}

function CallingForm({ existing }: { existing: Calling | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(existing ? formOf(existing) : emptyForm);
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [holders, setHolders] = useState<number | null>(null); // set while the access confirmation is open
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  function update(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setFormError(undefined);
  }

  function chooseLevel(level: CallingLevel) {
    // Drop the access and the section that stop being valid for the new level.
    setForm((current) => ({
      ...current,
      level,
      access: accessesForLevel(level).includes(current.access) ? current.access : 'none',
      orgChartSection:
        current.orgChartSection && sectionsForLevel(level).includes(current.orgChartSection)
          ? current.orgChartSection
          : null,
    }));
    setFormError(undefined);
  }

  function validateName(): boolean {
    const name = form.namePt.trim();
    if (name === '') {
      setNameError(t('callings.form.errors.nameRequired'));
      return false;
    }
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      setNameError(t('callings.form.errors.nameLength'));
      return false;
    }
    return true;
  }

  async function persist() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      await saveCalling({
        id: existing?.id ?? null,
        namePt: form.namePt.trim(),
        nameEn: form.nameEn.trim() || null,
        nameEs: form.nameEs.trim() || null,
        level: form.level,
        access: form.access,
        notifyGroup: form.notifyGroup,
        orgChartSection: form.orgChartSection,
        active: form.active,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: callingCatalogQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['viewer'] }),
      ]);
      toast.show({ message: t('callings.form.saved'), tone: 'success' });
      router.back();
    } catch (thrown) {
      await showError(thrown);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  async function showError(thrown: unknown) {
    const code = thrown instanceof AccountError ? thrown.code : 'unknown';
    if (code === 'name_taken') {
      setNameError(t('callings.form.errors.nameTaken'));
    } else if (code === 'level_locked') {
      setFormError(t('callings.form.errors.levelLocked'));
    } else if (code === 'in_use' && existing) {
      try {
        const count = await callingHolderCount(existing.id);
        setFormError(t('callings.form.errors.inUse', { count }));
      } catch {
        toast.show({ message: t('common.genericError') });
      }
    } else {
      toast.show({
        message: t(code === 'network' ? 'auth.errors.network' : 'common.genericError'),
      });
    }
  }

  async function submit() {
    if (inFlight.current || !validateName()) return;
    // RF-22: changing the access of a calling that people have asks first.
    if (existing && form.access !== existing.access) {
      inFlight.current = true;
      setLoading(true);
      try {
        const count = await callingHolderCount(existing.id);
        if (count > 0) {
          setHolders(count);
          return;
        }
      } catch (thrown) {
        await showError(thrown);
        return;
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    }
    await persist();
  }

  const levelLabel = t('callings.form.level');
  const accessLabel = t('callings.form.access');
  const groupLabel = t('callings.form.group');
  const sectionLabel = t('callings.form.section');

  return (
    <>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('callings.form.namePt')}
          value={form.namePt}
          onChangeText={(value) => {
            update({ namePt: value });
            setNameError(undefined);
          }}
          error={nameError}
          maxLength={NAME_MAX}
        />
        <TextField
          label={t('callings.form.nameEn')}
          value={form.nameEn}
          onChangeText={(value) => update({ nameEn: value })}
          maxLength={NAME_MAX}
        />
        <TextField
          label={t('callings.form.nameEs')}
          value={form.nameEs}
          onChangeText={(value) => update({ nameEs: value })}
          maxLength={NAME_MAX}
        />

        <ChipGroup label={levelLabel}>
          {callingLevels.map((level) => (
            <FilterChip
              key={level}
              label={t(`callings.levels.${level}`)}
              selected={form.level === level}
              onPress={() => chooseLevel(level)}
            />
          ))}
        </ChipGroup>

        <ChipGroup label={accessLabel}>
          {accessesForLevel(form.level).map((access) => (
            <FilterChip
              key={access}
              label={t(`callings.access.${access}`)}
              selected={form.access === access}
              onPress={() => update({ access })}
            />
          ))}
        </ChipGroup>

        <ChipGroup label={groupLabel}>
          <FilterChip
            label={t('callings.groups.none')}
            selected={form.notifyGroup === null}
            onPress={() => update({ notifyGroup: null })}
          />
          {notifyGroups.map((group) => (
            <FilterChip
              key={group}
              label={t(`callings.groups.${group}`)}
              selected={form.notifyGroup === group}
              onPress={() => update({ notifyGroup: group })}
            />
          ))}
        </ChipGroup>

        <ChipGroup label={sectionLabel}>
          <FilterChip
            label={t('callings.sections.none')}
            selected={form.orgChartSection === null}
            onPress={() => update({ orgChartSection: null })}
          />
          {sectionsForLevel(form.level).map((section) => (
            <FilterChip
              key={section}
              label={t(
                section === 'bishopric' && form.level === 'branch'
                  ? 'callings.sections.bishopric_branch'
                  : `callings.sections.${section}`,
              )}
              selected={form.orgChartSection === section}
              onPress={() => update({ orgChartSection: section })}
            />
          ))}
        </ChipGroup>

        <ListItem
          title={t('callings.form.active')}
          trailing={{
            kind: 'switch',
            value: form.active,
            onValueChange: (active) => update({ active }),
            label: t('callings.form.active'),
          }}
        />

        {formError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {formError}
          </Text>
        ) : null}
        <Button label={t('callings.form.save')} loading={loading} onPress={() => void submit()} />
      </ScrollView>

      <ConfirmSheet
        visible={holders !== null}
        title={t('callings.form.confirmAccess.title')}
        message={t('callings.form.confirmAccess.message', {
          count: holders ?? 0,
          access: t(`callings.access.${form.access}`),
        })}
        confirmLabel={t('callings.form.confirmAccess.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setHolders(null);
          void persist();
        }}
        onCancel={() => setHolders(null)}
      />
    </>
  );
}

/** RNF-09: a row of chips is a labeled group; the chosen chip is announced as selected. */
function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface },
  body: { flex: 1, padding: space.lg, backgroundColor: theme.bg, justifyContent: 'center' },
  form: { gap: space.lg, paddingHorizontal: space.lg, paddingBottom: space.xxl },
  group: { gap: space.sm },
  label: { ...type.fieldLabel, color: theme.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  error: { ...type.fieldError, color: theme.danger },
});
