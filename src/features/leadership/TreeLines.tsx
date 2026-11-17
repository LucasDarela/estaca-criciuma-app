import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space, stroke, theme } from '@/theme/theme';

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Decorative lines from the top position down to the two columns (RNF-10: hidden from screen readers). */
export function TreeConnector() {
  return (
    <View {...hidden} testID="tree-connector" style={styles.connector}>
      <View style={styles.stem} />
      <View style={styles.row}>
        <View style={[styles.half, styles.halfLeft]}>
          <View style={styles.leftBranch} />
        </View>
        <View style={[styles.half, styles.halfRight]}>
          <View style={styles.rightBranch} />
        </View>
      </View>
    </View>
  );
}

/** A vertical line on the left of a column's items. The line is hidden; the children are not. */
export function ColumnRail({ children }: { children: ReactNode }) {
  return (
    <View style={styles.rail}>
      <View {...hidden} testID="column-rail" style={styles.railLine} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  connector: { alignItems: 'center' },
  stem: { width: stroke.strong, height: space.lg, backgroundColor: theme.borderStrong },
  row: { flexDirection: 'row', alignSelf: 'stretch' },
  half: { flex: 1 },
  halfLeft: { alignItems: 'flex-end' },
  halfRight: { alignItems: 'flex-start' },
  leftBranch: {
    width: '50%',
    height: space.lg,
    borderTopWidth: stroke.strong,
    borderLeftWidth: stroke.strong,
    borderColor: theme.borderStrong,
  },
  rightBranch: {
    width: '50%',
    height: space.lg,
    borderTopWidth: stroke.strong,
    borderRightWidth: stroke.strong,
    borderColor: theme.borderStrong,
  },
  rail: { paddingLeft: space.md, marginTop: space.sm },
  railLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: stroke.strong,
    backgroundColor: theme.borderStrong,
  },
});
