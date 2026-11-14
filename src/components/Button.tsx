import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { pressedStyle } from './pressable';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'compact';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const palette = {
  primary: { bg: theme.primary, fg: theme.onPrimary },
  secondary: { bg: theme.primarySubtle, fg: theme.primary },
  outline: { bg: theme.surface, fg: theme.text },
  ghost: { bg: 'transparent', fg: theme.primary },
  danger: { bg: theme.danger, fg: theme.onDanger },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size: buttonSize = 'default',
  icon,
  loading = false,
  disabled = false,
  accessibilityLabel,
}: ButtonProps) {
  const compact = buttonSize === 'compact';
  const colors = disabled
    ? { bg: theme.surfaceDisabled, fg: theme.textDisabled }
    : palette[variant];
  const showBorder = variant === 'outline' && !disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      // Ignoring the press while loading (instead of disabling) keeps the control focusable.
      onPress={loading ? undefined : onPress}
      style={(state) => [
        styles.base,
        {
          minHeight: compact ? size.buttonCompact : size.button,
          borderRadius: compact ? radius.buttonCompact : radius.button,
          backgroundColor: colors.bg,
        },
        showBorder && styles.outline,
        pressedStyle(state),
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : icon ? (
        <Icon name={icon} color={colors.fg} />
      ) : null}
      <Text
        numberOfLines={2}
        style={[compact ? type.buttonCompact : type.button, styles.label, { color: colors.fg }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
  },
  outline: { borderWidth: stroke.strong, borderColor: theme.borderStrong },
  label: { textAlign: 'center', flexShrink: 1 },
});
