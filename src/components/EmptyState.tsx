import { StyleSheet, Text, View } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

import { Button } from './Button';
import { Icon } from './icons/Icon';
import type { IconName } from './icons/glyphs';

export type EmptyStateProps = {
  message: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ message, icon, action }: EmptyStateProps) {
  return (
    <View style={styles.box}>
      {icon ? <Icon name={icon} size={size.icon} color={theme.textSubtle} /> : null}
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Button variant="secondary" size="compact" label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderWidth: stroke.strong,
    borderStyle: 'dashed',
    borderColor: theme.borderStrong,
    borderRadius: radius.emptyState,
  },
  message: { ...type.body, color: theme.textMuted, textAlign: 'center' },
});
