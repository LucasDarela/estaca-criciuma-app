import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { pressedStyle } from '@/components/pressable';
import { radius, size, space, stroke, theme, type } from '@/theme/theme';

export type ConsentCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The full consent text; it is also the accessibility label (RNF-10). */
  label: string;
  error?: string;
};

export function ConsentCheckbox({ checked, onChange, label, error }: ConsentCheckboxProps) {
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        accessibilityHint={error}
        onPress={() => onChange(!checked)}
        style={(state) => [styles.row, pressedStyle(state)]}
      >
        <View
          style={[
            styles.box,
            checked && styles.boxChecked,
            { borderColor: error ? theme.danger : checked ? theme.primary : theme.borderStrong },
          ]}
        >
          {checked ? <Icon name="check" size={size.iconSearch} color={theme.onPrimary} /> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  box: {
    width: size.checkbox,
    height: size.checkbox,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.tag,
    borderWidth: stroke.strong,
    backgroundColor: theme.surface,
  },
  boxChecked: { backgroundColor: theme.primary },
  label: { ...type.body, flex: 1, color: theme.textBody },
  error: { ...type.fieldError, color: theme.danger },
});
