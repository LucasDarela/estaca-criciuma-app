import Svg, { Path } from 'react-native-svg';

import { size, theme } from '@/theme/theme';

import { glyphs, iconViewBox, type IconName } from './glyphs';

export type IconProps = { name: IconName; filled?: boolean; size?: number; color?: string };

/**
 * Material Symbols Rounded glyph. Always hidden from screen readers: the touchable that
 * contains it carries the accessibility label (RNF-10).
 */
export function Icon({
  name,
  filled = false,
  size: iconSize = size.icon,
  color = theme.text,
}: IconProps) {
  const paths = glyphs[name][filled ? 'filled' : 'outlined'];
  return (
    <Svg
      width={iconSize}
      height={iconSize}
      viewBox={iconViewBox}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {paths.map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}
