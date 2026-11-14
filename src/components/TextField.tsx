import { forwardRef, type ComponentRef, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { radius, size, space, stroke, theme, type } from '@/theme/theme';

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
} & Pick<
  TextInputProps,
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoComplete'
  | 'textContentType'
  | 'secureTextEntry'
  | 'onBlur'
  | 'onSubmitEditing'
>;

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(
  function TextField(
    { label, value, onChangeText, error, hint, multiline, maxLength, onBlur, ...inputProps },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const previousError = useRef<string | undefined>(undefined);

    // RNF-09: announce the message when it appears, not on every re-render.
    useEffect(() => {
      if (error && !previousError.current) AccessibilityInfo.announceForAccessibility(error);
      previousError.current = error;
    }, [error]);

    const borderColor = error ? theme.danger : focused ? theme.primary : theme.borderStrong;

    return (
      <View style={styles.root}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.ring, focused && !error && styles.ringFocused]}>
          <TextInput
            {...inputProps}
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            multiline={multiline}
            maxLength={maxLength}
            accessibilityLabel={label}
            accessibilityHint={error ?? hint}
            onFocus={() => setFocused(true)}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            style={[
              styles.input,
              multiline && styles.inputMultiline,
              { borderColor, borderWidth: focused || error ? stroke.strong : stroke.hairline },
            ]}
          />
        </View>
        {error ? (
          <Text style={[styles.message, { color: theme.danger }]}>{error}</Text>
        ) : hint ? (
          <Text style={[styles.message, { color: theme.textMuted }]}>{hint}</Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { gap: space.xs },
  label: { ...type.fieldLabel, color: theme.text },
  // The ring always reserves its width (transparent) and is pulled back with a negative margin,
  // so focusing does not shift the layout.
  ring: {
    margin: -stroke.focusRing,
    borderWidth: stroke.focusRing,
    borderColor: 'transparent',
    borderRadius: radius.input + stroke.focusRing,
  },
  ringFocused: { borderColor: theme.focusRing },
  input: {
    ...type.body,
    minHeight: size.input,
    paddingHorizontal: space.lg,
    borderRadius: radius.input,
    backgroundColor: theme.surface,
    color: theme.text,
  },
  inputMultiline: { paddingTop: space.md, paddingBottom: space.md, textAlignVertical: 'top' },
  message: type.fieldError,
});
