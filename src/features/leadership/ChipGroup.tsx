import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { space, theme, type } from '@/theme/theme';

/** A labelled group of chips: `radiogroup` for a single choice, `list` for several (RNF-13). */
export function ChipGroup({
  label,
  role,
  children,
}: {
  label: string;
  role: 'radiogroup' | 'list';
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole={role} accessibilityLabel={label} style={styles.chips}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  label: { ...type.fieldLabel, color: theme.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
