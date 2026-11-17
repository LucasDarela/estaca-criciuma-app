import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

import { Icon } from './icons/Icon';
import { pressedStyle } from './pressable';

export type CheckboxProps = {
  label: string;
  /** A short line under the label, also announced as the accessibility hint. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** Form checkbox (22, radius 6). The row is the touch target (RNF-06). */
export function Checkbox({ label, hint, checked, onChange, disabled = false }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={(state) => [styles.row, disabled && styles.disabled, pressedStyle(state)]}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? theme.primary : theme.borderStrong },
          checked && styles.boxChecked,
        ]}
      >
        {checked ? <Icon name="check" size={size.iconSearch} color={theme.onPrimary} /> : null}
      </View>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: size.touchMinIos,
  },
  disabled: { opacity: 0.5 },
  box: {
    width: size.checkboxForm,
    height: size.checkboxForm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.checkbox,
    borderWidth: stroke.strong,
    backgroundColor: theme.surface,
  },
  boxChecked: { backgroundColor: theme.primary },
  texts: { flex: 1, gap: space.xs },
  label: { ...type.listTitle, color: theme.text },
  hint: { ...type.caption, color: theme.textMuted },
});
