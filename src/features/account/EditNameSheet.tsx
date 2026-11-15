import { useState } from 'react';
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
export function EditNameSheet({ visible, onClose, ...form }: EditNameSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('account.profile.name')}>
      {/* Mounted only while open, so the field restarts from the current name each time. */}
      {visible ? <EditNameForm {...form} /> : null}
    </Sheet>
  );
}

function EditNameForm({
  initialName,
  loading,
  onSave,
}: Omit<EditNameSheetProps, 'visible' | 'onClose'>) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();

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
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
});
