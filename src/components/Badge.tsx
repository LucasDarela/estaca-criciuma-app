import { StyleSheet, Text, View } from 'react-native';

import { radius, size, space, theme, type } from '@/theme/theme';

const maxCount = 99;

export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{count > maxCount ? `${maxCount}+` : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: size.badge,
    height: size.badge,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...type.badge, color: theme.onDanger },
});
