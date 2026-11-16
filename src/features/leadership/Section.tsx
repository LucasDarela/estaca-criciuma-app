import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, space, stroke, theme, type } from '@/theme/theme';

/** An overline (a header for screen readers) and a surface block (RF-11, RF-12). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.overline}>
        {title}
      </Text>
      <Card>{children}</Card>
    </View>
  );
}

/** A surface block with a radius and a hairline border. */
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { marginTop: space.xl, gap: space.sm },
  overline: { ...type.overline, color: theme.primary },
  card: {
    paddingHorizontal: space.md,
    backgroundColor: theme.surface,
    borderWidth: stroke.hairline,
    borderColor: theme.border,
    borderRadius: radius.card,
  },
});
