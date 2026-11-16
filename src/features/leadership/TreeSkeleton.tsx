import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { size, space } from '@/theme/theme';

/** RF-20: the shape of the tree while it loads (top position and two columns). */
export function TreeSkeleton() {
  return (
    <View testID="tree-skeleton" style={styles.root}>
      <Skeleton width="100%" height={size.avatarLarge + space.xxl} radius="card" />
      <View style={styles.columns}>
        {[0, 1].map((column) => (
          <View key={column} style={styles.column}>
            <Skeleton width="100%" height={size.avatar + space.xl} radius="card" />
            <Skeleton width="100%" height={size.touchMinIos} />
            <Skeleton width="100%" height={size.touchMinIos} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.lg },
  columns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1, gap: space.sm },
});
