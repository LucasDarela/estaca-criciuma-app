import { StyleSheet, Text, View } from 'react-native';

import { initials } from '@/domain/initials';
import { radius, size, theme, type } from '@/theme/theme';

export type AvatarProps = { name: string; size?: 'small' | 'default' | 'large' };

const variants = {
  small: {
    box: size.headerAvatar,
    bg: theme.primarySubtle,
    fg: theme.primary,
    font: type.fieldLabel,
  },
  default: { box: size.avatar, bg: theme.primarySubtle, fg: theme.primary, font: type.callout },
  large: { box: size.avatarLarge, bg: theme.primary, fg: theme.onPrimary, font: type.avatarLarge },
} as const;

/** Hidden from screen readers: the parent control carries the label (the name is not repeated). */
export function Avatar({ name, size: avatarSize = 'default' }: AvatarProps) {
  const variant = variants[avatarSize];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { width: variant.box, height: variant.box, backgroundColor: variant.bg },
      ]}
    >
      <Text style={[variant.font, { color: variant.fg }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
