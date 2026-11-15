import { StyleSheet, Text, View } from 'react-native';

import type { Locale } from '@/domain/profile';
import { space, theme, type } from '@/theme/theme';

import { ListItem } from './ListItem';
import { Sheet } from './Sheet';

export type LanguageSheetProps = {
  visible: boolean;
  title: string;
  options: readonly { value: Locale; label: string }[];
  value: Locale;
  onSelect: (locale: Locale) => void;
  onClose: () => void;
};

export function LanguageSheet({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: LanguageSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {options.map((option) => (
          <ListItem
            key={option.value}
            title={option.label}
            selected={option.value === value}
            trailing={option.value === value ? { kind: 'check' } : undefined}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xs },
  title: { ...type.headline, color: theme.heading, paddingBottom: space.sm },
});
