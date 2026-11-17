import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { minTouchSlop, pressedStyle } from '@/components/pressable';
import { radius, size, space, stroke, theme, type } from '@/theme/theme';

export type FormHeaderProps = {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  /** Looks and announces as disabled, but a tap still runs `onInvalidSave` (RNF-10). */
  valid: boolean;
  saving: boolean;
  onInvalidSave: () => void;
};

/** `Cancelar` · title · `Salvar` (compact primary pill). */
export function FormHeader({
  title,
  onCancel,
  onSave,
  valid,
  saving,
  onInvalidSave,
}: FormHeaderProps) {
  const { t } = useTranslation();
  const disabled = !valid || saving;
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        accessibilityState={{ disabled: saving }}
        disabled={saving}
        hitSlop={minTouchSlop(size.buttonCompact)}
        onPress={onCancel}
        style={(state) => [styles.side, pressedStyle(state)]}
      >
        <Text style={styles.cancel}>{t('common.cancel')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saving ? t('events.form.saving') : t('events.form.save')}
        accessibilityState={{ disabled, busy: saving }}
        onPress={saving ? undefined : valid ? onSave : onInvalidSave}
        style={(state) => [
          styles.save,
          disabled ? styles.saveDisabled : null,
          disabled ? null : pressedStyle(state),
        ]}
      >
        <Text style={[styles.saveText, { color: disabled ? theme.textDisabled : theme.onPrimary }]}>
          {saving ? t('events.form.saving') : t('events.form.save')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: theme.surface,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: theme.border,
  },
  side: { minWidth: size.buttonCompact, justifyContent: 'center' },
  cancel: { ...type.callout, color: theme.primary },
  title: { ...type.headline, flex: 1, textAlign: 'center', color: theme.heading },
  save: {
    minHeight: size.buttonCompact,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: theme.primary,
  },
  saveDisabled: { backgroundColor: theme.surfaceDisabled },
  saveText: type.button,
});
