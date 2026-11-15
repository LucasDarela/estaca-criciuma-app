import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { ListItem } from '@/components/ListItem';
import { Sheet } from '@/components/Sheet';
import type { Locale } from '@/domain/profile';
import { space, theme, type } from '@/theme/theme';

export const localeOptions: readonly Locale[] = ['pt-BR', 'en-US', 'es-MX'];

export type LanguageSheetProps = {
  visible: boolean;
  value: Locale;
  onSelect: (locale: Locale) => void;
  onClose: () => void;
};

export function LanguageSheet({ visible, value, onSelect, onClose }: LanguageSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('account.profile.language')}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('account.profile.language')}
        </Text>
        {localeOptions.map((locale) => (
          <ListItem
            key={locale}
            title={t(`account.languages.${locale}`)}
            selected={locale === value}
            trailing={locale === value ? { kind: 'check' } : undefined}
            onPress={() => onSelect(locale)}
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
