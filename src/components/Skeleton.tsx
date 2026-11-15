import type { DimensionValue } from 'react-native';
import { View } from 'react-native';

import { radius as radii, theme } from '@/theme/theme';

export type SkeletonProps = {
  width: DimensionValue;
  height: number;
  radius?: keyof typeof radii;
};

export function Skeleton({ width, height, radius = 'tag' }: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radii[radius], backgroundColor: theme.surfaceDisabled }}
    />
  );
}
