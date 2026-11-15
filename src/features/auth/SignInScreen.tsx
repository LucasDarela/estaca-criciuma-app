import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { EMAIL_MAX_LENGTH, normalizeEmail, validateEmail } from '@/domain/email';
import { space, theme, type } from '@/theme/theme';

import { requestCode, toAuthFlowError } from './api';
import { Signature } from './components/Signature';

/** Translation key for a code error shown under the e-mail or code field. */
export function authErrorKey(code: 'invalid_code' | 'rate_limited' | 'network' | 'unknown') {
  switch (code) {
    case 'invalid_code':
      return 'auth.errors.invalidCode';
    case 'rate_limited':
      return 'auth.errors.rateLimited';
    case 'network':
      return 'auth.errors.network';
    default:
      return 'common.genericError';
  }
}

export function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit() {
    if (inFlight.current) return; // double tap: only one request (7.6)
    const problem = validateEmail(email);
    if (problem) {
      // TextField announces the message when it appears (RNF-08); focus goes to the field.
      setError(
        t(problem === 'required' ? 'auth.errors.emailRequired' : 'auth.errors.emailInvalid'),
      );
      input.current?.focus();
      return;
    }
    setError(undefined);
    inFlight.current = true;
    setLoading(true);
    try {
      await requestCode(email);
      router.push({
        pathname: '/sign-in/code',
        params: { email: normalizeEmail(email), ...(returnTo ? { returnTo } : {}) },
      });
    } catch (thrown) {
      setError(t(authErrorKey(toAuthFlowError(thrown).code)));
      input.current?.focus();
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Signature />
          <Text accessibilityRole="header" style={styles.title}>
            {t('auth.signIn.title')}
          </Text>
          <Text style={styles.intro}>{t('auth.signIn.intro')}</Text>
          <TextField
            ref={input}
            label={t('auth.signIn.email')}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(undefined);
            }}
            error={error}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={EMAIL_MAX_LENGTH}
            onSubmitEditing={() => void submit()}
          />
          <Button label={t('auth.signIn.submit')} loading={loading} onPress={() => void submit()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
  title: { ...type.title, color: theme.heading },
  intro: { ...type.body, color: theme.textBody },
});
