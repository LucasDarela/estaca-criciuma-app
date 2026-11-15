import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { space, theme, type } from '@/theme/theme';

import { requestCode, toAuthFlowError, verifyCode } from './api';
import { CODE_LENGTH, CodeField } from './components/CodeField';
import { authErrorKey } from './SignInScreen';

const RESEND_SECONDS = 60;

export function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { email = '', returnTo } = useLocalSearchParams<{ email?: string; returnTo?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inFlight = useRef(false);

  // RNF-09: the countdown is a plain label (not a live region); only the end is announced.
  useEffect(() => {
    if (seconds <= 0) {
      AccessibilityInfo.announceForAccessibility(t('auth.code.resend'));
      return;
    }
    const timer = setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, t]);

  function fail(thrown: unknown) {
    const message = t(authErrorKey(toAuthFlowError(thrown).code));
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }

  async function submit() {
    if (inFlight.current || code.length !== CODE_LENGTH) return;
    inFlight.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const { consented } = await verifyCode(email, code);
      router.replace(consented ? (returnTo ?? '/agenda') : '/welcome');
    } catch (thrown) {
      fail(thrown);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  async function resend() {
    if (seconds > 0 || inFlight.current) return;
    inFlight.current = true;
    setError(undefined);
    try {
      await requestCode(email);
      setCode('');
      setSeconds(RESEND_SECONDS);
    } catch (thrown) {
      fail(thrown);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('auth.code.title')} onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>{t('auth.code.sentTo', { email })}</Text>
          <CodeField
            value={code}
            onChangeText={(value) => {
              setCode(value);
              setError(undefined);
            }}
            error={error}
          />
          <Button
            label={t('auth.code.submit')}
            loading={loading}
            disabled={code.length !== CODE_LENGTH}
            onPress={() => void submit()}
          />
          <Button
            variant="ghost"
            label={seconds > 0 ? t('auth.code.resendIn', { seconds }) : t('auth.code.resend')}
            disabled={seconds > 0}
            onPress={() => void resend()}
          />
          <Button variant="ghost" label={t('auth.code.otherEmail')} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
  intro: { ...type.body, color: theme.textBody },
});
