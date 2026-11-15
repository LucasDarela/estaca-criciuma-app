import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

export const CODE_LENGTH = 6;

export type CodeFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
};

/**
 * Six boxes that represent one field (RNF-07): a single invisible TextInput sits over them, so
 * pasting or the system's one-time-code suggestion fills everything and screen readers find a
 * single "Código de 6 dígitos" control.
 */
export function CodeField({ value, onChangeText, error }: CodeFieldProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{t('auth.code.label')}</Text>
      <View style={styles.boxes}>
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const active = focused && index === Math.min(value.length, CODE_LENGTH - 1);
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  borderColor: error ? theme.danger : active ? theme.primary : theme.borderStrong,
                  borderWidth: error || active ? stroke.strong : stroke.hairline,
                },
              ]}
            >
              <Text style={styles.digit}>{value[index] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={CODE_LENGTH}
          caretHidden
          accessibilityLabel={t('auth.code.a11yLabel')}
          accessibilityHint={error}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  label: { ...type.fieldLabel, color: theme.text },
  boxes: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    width: size.codeBoxWidth,
    height: size.codeBoxHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    backgroundColor: theme.surface,
  },
  digit: { ...type.headline, color: theme.text },
  // Invisible but still the real, focusable control.
  input: { ...StyleSheet.absoluteFill, opacity: 0.02, color: 'transparent' },
  error: { ...type.fieldError, color: theme.danger },
});
