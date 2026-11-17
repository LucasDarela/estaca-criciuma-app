import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

import { Avatar } from './Avatar';
import { useHeaderAvatar } from './HeaderAvatarContext';
import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';
import { minTouchSlop, pressedStyle } from './pressable';

export type HeaderAction = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  tone?: 'primary' | 'neutral';
  /** A small dot in the corner of the button, e.g. unread notifications. */
  badge?: boolean;
  /** Shown with surfaceDisabled/textDisabled; onPress is not called; accessibilityState.disabled. */
  disabled?: boolean;
};

export type ScreenHeaderProps = {
  title: string;
  overline?: string;
  onBack?: () => void;
  actions?: readonly HeaderAction[];
  /** A text button in the header's right side (e.g. "Ler todas"). */
  textAction?: { label: string; onPress: () => void };
  showAvatar?: boolean;
};

const maxActions = 2;

export function ScreenHeader({
  title,
  overline,
  onBack,
  actions,
  textAction,
  showAvatar,
}: ScreenHeaderProps) {
  const { t } = useTranslation();
  const avatar = useHeaderAvatar();

  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          style={(state) => [styles.circle, styles.neutral, pressedStyle(state)]}
        >
          <Icon name="arrow_back" color={theme.text} />
        </Pressable>
      ) : null}
      <View style={styles.titles}>
        {overline ? <Text style={styles.overline}>{overline}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
      {textAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textAction.label}
          hitSlop={minTouchSlop(size.iconButton)}
          onPress={textAction.onPress}
          style={(state) => pressedStyle(state)}
        >
          <Text style={styles.textAction}>{textAction.label}</Text>
        </Pressable>
      ) : null}
      {(actions ?? []).slice(0, maxActions).map((action) => {
        const primary = (action.tone ?? 'primary') === 'primary';
        return (
          <Pressable
            key={action.icon + action.accessibilityLabel}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            accessibilityState={{ disabled: action.disabled === true }}
            onPress={action.disabled ? undefined : action.onPress}
            style={(state) => [
              styles.circle,
              action.disabled ? styles.disabled : primary ? styles.primary : styles.neutral,
              action.disabled ? null : pressedStyle(state),
            ]}
          >
            <Icon
              name={action.icon}
              color={action.disabled ? theme.textDisabled : primary ? theme.onPrimary : theme.text}
            />
            {action.badge ? <View testID="header-action-badge" style={styles.badge} /> : null}
          </Pressable>
        );
      })}
      {showAvatar && avatar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.profile')}
          hitSlop={(size.touchMinIos - size.headerAvatar) / 2}
          onPress={avatar.onPress}
          style={(state) => pressedStyle(state)}
        >
          <Avatar name={avatar.name} size="small" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: theme.surface,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: theme.border,
  },
  titles: { flex: 1 },
  overline: { ...type.overline, color: theme.primary },
  title: { ...type.headerTitle, color: theme.heading },
  textAction: { ...type.callout, color: theme.primary },
  circle: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: size.unitDot,
    height: size.unitDot,
    borderRadius: radius.pill,
    backgroundColor: theme.danger,
    borderWidth: stroke.hairline,
    borderColor: theme.surfaceMuted,
  },
  primary: { backgroundColor: theme.primary },
  neutral: { backgroundColor: theme.surfaceMuted },
  disabled: { backgroundColor: theme.surfaceDisabled },
});
