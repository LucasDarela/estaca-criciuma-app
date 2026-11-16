import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { LanguageSheet } from '@/components/LanguageSheet';
import { ListItem } from '@/components/ListItem';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { UnitPickerSheet } from '@/components/UnitPickerSheet';
import { useToast } from '@/components/toast/ToastProvider';
import { validateDisplayName } from '@/domain/displayName';
import type { Locale } from '@/domain/profile';
import type { UnitId } from '@/domain/units';
import { privacyUrl } from '@/lib/config';
import { signOut } from '@/lib/authSession';
import { requestEnablePushPrompt } from '@/lib/push';
import { space, theme, unitOrder, units } from '@/theme/theme';

import { completeWelcome } from './api';
import { ConsentCheckbox } from './components/ConsentCheckbox';

const locales: readonly Locale[] = ['pt-BR', 'en-US', 'es-MX'];
const selectableUnits = unitOrder.filter((id) => id !== 'estaca');

export function WelcomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [unit, setUnit] = useState<UnitId | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);
  const privacy = privacyUrl();
  const currentLocale = locales.find((locale) => locale === i18n.language) ?? 'pt-BR';

  // RF-10: leaving without finishing ends the session (an account without consent is not used).
  async function leave() {
    await signOut();
    router.replace('/agenda');
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void signOut().then(() => router.replace('/agenda'));
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  async function submit() {
    if (inFlight.current) return;
    const nameProblem = validateDisplayName(name);
    const nameMessage = nameProblem
      ? t(
          nameProblem === 'required'
            ? 'auth.welcome.errors.nameRequired'
            : 'auth.welcome.errors.nameLength',
        )
      : undefined;
    const consentMessage = consent ? undefined : t('auth.welcome.errors.consent');
    setNameError(nameMessage);
    setConsentError(consentMessage);
    if (nameMessage || consentMessage) {
      if (nameMessage) nameInput.current?.focus();
      return;
    }

    inFlight.current = true;
    setLoading(true);
    try {
      await completeWelcome({
        displayName: name.trim(),
        homeUnitId: unit,
        locale: currentLocale,
      });
      await queryClient.invalidateQueries({ queryKey: ['viewer'] });
      requestEnablePushPrompt();
      router.replace('/agenda');
    } catch {
      toast.show({ message: t('common.genericError') });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('auth.welcome.title')} onBack={() => void leave()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            ref={nameInput}
            label={t('auth.welcome.name')}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameError(undefined);
            }}
            error={nameError}
            autoComplete="name"
            textContentType="name"
            maxLength={60}
          />
          <View>
            <ListItem
              title={t('auth.welcome.unit')}
              subtitle={unit ? units[unit].label : t('auth.welcome.unitNone')}
              trailing={{ kind: 'chevron' }}
              onPress={() => setPickerOpen(true)}
            />
          </View>
          <View>
            <ListItem
              title={t('account.profile.language')}
              subtitle={t(`account.languages.${currentLocale}`)}
              trailing={{ kind: 'chevron' }}
              onPress={() => setLanguageOpen(true)}
            />
          </View>
          <ConsentCheckbox
            checked={consent}
            onChange={(value) => {
              setConsent(value);
              setConsentError(undefined);
            }}
            label={t('auth.welcome.consent')}
            error={consentError}
          />
          {privacy ? (
            <Button
              variant="ghost"
              label={t('auth.welcome.privacy')}
              onPress={() => void Linking.openURL(privacy)}
            />
          ) : null}
          <Button
            label={t('auth.welcome.submit')}
            loading={loading}
            onPress={() => void submit()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <UnitPickerSheet
        visible={pickerOpen}
        title={t('auth.welcome.unit')}
        noneLabel={t('auth.welcome.unitNone')}
        value={unit}
        units={selectableUnits}
        onSelect={(next) => {
          setUnit(next);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
      <LanguageSheet
        visible={languageOpen}
        title={t('account.profile.language')}
        options={locales.map((value) => ({ value, label: t(`account.languages.${value}`) }))}
        value={currentLocale}
        onSelect={(next) => {
          setLanguageOpen(false);
          void i18n.changeLanguage(next);
        }}
        onClose={() => setLanguageOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
});
