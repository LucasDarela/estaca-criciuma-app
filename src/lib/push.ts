import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { AudienceKey } from '@/domain/audience';
import i18n from '@/i18n';
import { supportedLanguages } from '@/i18n/resolveLanguage';

import { getSupabase } from './supabase';

export type PushPermission = 'granted' | 'undetermined' | 'denied' | 'unsupported';

const ANDROID_CHANNEL = 'default';
const REGISTRATION_STORAGE_KEY = 'push.lastRegistration.v1';
const REGISTRATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Android 8+ needs the channel before the first notification (and before the Android 13 prompt). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: i18n.t('push.channelName'),
    importance: AndroidImportance.HIGH,
  });
}

function toPermission(response: Notifications.NotificationPermissionsStatus): PushPermission {
  if (response.granted) return 'granted';
  // A refusal that can still be asked again is not final: the system dialog can reappear.
  return response.status === Notifications.PermissionStatus.DENIED && !response.canAskAgain
    ? 'denied'
    : 'undetermined';
}

/** `unsupported` outside a physical device (7.7). `denied` only when the system will not ask again. */
export async function getPushPermission(): Promise<PushPermission> {
  if (!Device.isDevice) return 'unsupported';
  return toPermission(await Notifications.getPermissionsAsync());
}

/** Shows the system dialog when it can; returns the resulting state. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!Device.isDevice) return 'unsupported';
  await ensureAndroidChannel();
  return toPermission(await Notifications.requestPermissionsAsync());
}

/** Null without permission, outside a physical device or without the EAS projectId. */
export async function getDevicePushToken(): Promise<string | null> {
  if ((await getPushPermission()) !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // No network or a push service outage: the next opening tries again.
    return null;
  }
}

type RegistrationRecord = { key: string; at: string };

async function readRegistration(): Promise<RegistrationRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRATION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<RegistrationRecord>) : null;
    return parsed && typeof parsed.key === 'string' && typeof parsed.at === 'string'
      ? { key: parsed.key, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

function statusOf(error: unknown): number | null {
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as { status?: unknown } | undefined)?.status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export type RegisterResult = 'registered' | 'skipped' | 'no_token' | 'rate_limited' | 'failed';

/**
 * RF-07. Registers (or refreshes) this device at most once per 24 h for the same identity (the
 * visitor, or one account), unless `force` (signing in or out, or the user just enabled notices).
 * Sends the JWT automatically when signed in (supabase-js does it).
 */
export async function registerDevice(
  options: { force?: boolean; now?: Date } = {},
): Promise<RegisterResult> {
  const now = options.now ?? new Date();
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'no_token';

  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const key = data.session ? `user:${data.session.user.id}` : 'visitor';

  if (!options.force) {
    const last = await readRegistration();
    if (
      last &&
      last.key === key &&
      now.getTime() - new Date(last.at).getTime() < REGISTRATION_INTERVAL_MS
    ) {
      return 'skipped';
    }
  }

  const token = await getDevicePushToken();
  if (!token) return 'no_token';

  const locale = (supportedLanguages as readonly string[]).includes(i18n.language)
    ? i18n.language
    : 'pt-BR';
  const { error } = await supabase.functions.invoke('register-device', {
    body: { token, platform: Platform.OS, locale },
  });
  if (error) return statusOf(error) === 429 ? 'rate_limited' : 'failed';

  await AsyncStorage.setItem(
    REGISTRATION_STORAGE_KEY,
    JSON.stringify({ key, at: now.toISOString() } satisfies RegistrationRecord),
  );
  return 'registered';
}

export type PushErrorCode = 'forbidden' | 'rate_limited' | 'unavailable' | 'network' | 'unknown';

export class PushError extends Error {
  constructor(readonly code: PushErrorCode) {
    super(code);
    this.name = 'PushError';
  }
}

function toPushError(error: unknown): PushError {
  if (error instanceof FunctionsFetchError || error instanceof TypeError) {
    return new PushError('network');
  }
  switch (statusOf(error)) {
    case 403:
      return new PushError('forbidden');
    case 429:
      return new PushError('rate_limited');
    case 502:
      return new PushError('unavailable');
    default:
      return new PushError('unknown');
  }
}

/**
 * RF-12. Asks `send-push` to notify the audience about an event or a post. The server revalidates
 * everything (RNF-03). Throws `PushError`; use `pushErrorMessageKey` to show the message.
 */
export async function sendPush(input: {
  kind: 'event' | 'post';
  itemId: string;
  audience: AudienceKey[];
}): Promise<{ recipients: number }> {
  const { data, error } = await getSupabase().functions.invoke('send-push', { body: input });
  if (error) throw toPushError(error);
  const recipients = (data as { recipients?: unknown } | null)?.recipients;
  return { recipients: typeof recipients === 'number' ? recipients : 0 };
}

export const pushErrorMessageKey: Record<PushErrorCode, string> = {
  forbidden: 'push.errors.forbidden',
  rate_limited: 'push.errors.rateLimited',
  unavailable: 'push.errors.unavailable',
  network: 'push.errors.network',
  unknown: 'common.genericError',
};

// RF-05: the Welcome screen marks the prompt, PushEffects shows the sheet. In memory only.
let promptPending = false;
const promptListeners = new Set<() => void>();

function setPromptPending(value: boolean): void {
  promptPending = value;
  promptListeners.forEach((listener) => listener());
}

export function requestEnablePushPrompt(): void {
  setPromptPending(true);
}

function dismissEnablePushPrompt(): void {
  setPromptPending(false);
}

export function useEnablePushPrompt(): { pending: boolean; dismiss: () => void } {
  const pending = useSyncExternalStore(
    (listener) => {
      promptListeners.add(listener);
      return () => promptListeners.delete(listener);
    },
    () => promptPending,
    () => false,
  );
  return { pending, dismiss: dismissEnablePushPrompt };
}

/** RF-22: a system banner while the app is open, and the Android channel. Call once at startup. */
export async function configurePushPresentation(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  await ensureAndroidChannel();
}
