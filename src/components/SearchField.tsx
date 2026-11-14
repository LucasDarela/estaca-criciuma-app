import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radius, size, space, theme, type } from '@/theme/theme';

import { Icon } from './icons/Icon';
import { minTouchSlop, pressedStyle } from './pressable';

export type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  size?: 'default' | 'compact';
};

export function SearchField({
  value,
  onChangeText,
  placeholder,
  size: fieldSize = 'default',
}: SearchFieldProps) {
  const { t } = useTranslation();
  const height = fieldSize === 'compact' ? size.searchCompact : size.search;

  return (
    <View style={[styles.root, { height }]}>
      <Icon name="search" size={size.iconSearch} color={theme.textSubtle} />
      <TextInput
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        style={styles.input}
      />
      {value !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.clear')}
          hitSlop={{ ...minTouchSlop(height), left: space.sm, right: space.sm }}
          onPress={() => onChangeText('')}
          style={(state) => pressedStyle(state)}
        >
          <Icon name="cancel" size={size.iconSearch} color={theme.iconMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    backgroundColor: theme.surfaceMuted,
  },
  input: { ...type.body, flex: 1, color: theme.text, paddingVertical: 0 },
});
