import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { validateDisplayName } from '@/domain/displayName';
import { space, theme, type } from '@/theme/theme';

export type EditNameSheetProps = {
  visible: boolean;
  initialName: string;
  loading?: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
};

/** RF-12: same rules and messages as the welcome screen (RF-08, RF-09). */
export function EditNameSheet({
  visible,
  initialName,
  loading,
  onSave,
  onClose,
}: EditNameSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setError(undefined);
    }
  }, [visible, initialName]);

  function save() {
    const problem = validateDisplayName(name);
    if (problem) {
      setError(
        t(
          problem === 'required'
            ? 'auth.welcome.errors.nameRequired'
            : 'auth.welcome.errors.nameLength',
        ),
      );
      return;
    }
    onSave(name.trim());
  }

  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('account.profile.name')}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('account.profile.name')}
        </Text>
        <TextField
          label={t('account.profile.name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setError(undefined);
          }}
          error={error}
          autoComplete="name"
          textContentType="name"
          maxLength={60}
        />
        <Button label={t('account.profile.save')} loading={loading} onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
});
