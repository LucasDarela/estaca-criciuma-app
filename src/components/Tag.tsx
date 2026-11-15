import { StyleSheet, Text, View } from 'react-native';

import { radius, space, type } from '@/theme/theme';

/** Shared shape of UnitTag and StatusTag. Not exported from the design system. */
export function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Design asks for 3 px vertical padding; the nearest spacing token is used.
  tag: {
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.tag,
  },
  text: type.tag,
});
