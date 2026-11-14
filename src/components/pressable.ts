import type { Insets, ViewStyle } from 'react-native';

import { motion, size } from '@/theme/theme';

/** Shared touch feedback: every touchable dims while pressed (spec section 8). */
export function pressedStyle({ pressed }: { pressed: boolean }): ViewStyle {
  return pressed ? { opacity: motion.pressedOpacity } : {};
}

/** Vertical hitSlop that grows a control of `height` to the minimum touch target (RNF-08). */
export function minTouchSlop(height: number): Insets {
  const extra = Math.max(0, (size.touchMinIos - height) / 2);
  return { top: extra, bottom: extra };
}
