import { StyleSheet, Text, View } from 'react-native';

import { space, theme, type } from '@/theme/theme';

import { Button } from './Button';
import { Sheet } from './Sheet';

export type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onCancel} accessibilityLabel={title}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} />
          <Button label={cancelLabel} variant="outline" onPress={onCancel} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  message: { ...type.body, color: theme.textBody },
  actions: { gap: space.sm, marginTop: space.sm },
});
