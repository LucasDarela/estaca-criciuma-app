import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { act, renderHook } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '@/i18n';

import {
  getDevicePushToken,
  getPushPermission,
  PushError,
  pushErrorMessageKey,
  registerDevice,
  requestEnablePushPrompt,
  requestPushPermission,
  sendPush,
  useEnablePushPrompt,
} from './push';

const mockInvoke = jest.fn();
const mockGetSession = jest.fn();
jest.mock('./supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: mockGetSession },
    functions: { invoke: mockInvoke },
  }),
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

const permissions = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const getToken = Notifications.getExpoPushTokenAsync as jest.Mock;

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const granted = { granted: true, status: 'granted', canAskAgain: true };
const NOW = new Date('2026-11-15T12:00:00Z');

function setDevice(isDevice: boolean) {
  (Device as { isDevice: boolean }).isDevice = isDevice;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setDevice(true);
  Platform.OS = 'ios';
  (Constants.expoConfig as unknown) = { extra: { eas: { projectId: 'project-1' } } };
  permissions.mockResolvedValue(granted);
  getToken.mockResolvedValue({ data: TOKEN });
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockInvoke.mockResolvedValue({ data: { status: 'registered' }, error: null });
});

describe('permission', () => {
  it('is unsupported outside a physical device', async () => {
    setDevice(false);
    expect(await getPushPermission()).toBe('unsupported');
    expect(await requestPushPermission()).toBe('unsupported');
    expect(permissions).not.toHaveBeenCalled();
  });

  it('is denied only when the system will not ask again', async () => {
    permissions.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    expect(await getPushPermission()).toBe('denied');
    permissions.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: true });
    expect(await getPushPermission()).toBe('undetermined');
    permissions.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
    expect(await getPushPermission()).toBe('undetermined');
  });

  it('CA-05: requestPushPermission shows the system dialog and returns the result', async () => {
    requestPermissions.mockResolvedValue(granted);
    expect(await requestPushPermission()).toBe('granted');
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('creates the Android channel before asking', async () => {
    Platform.OS = 'android';
    requestPermissions.mockResolvedValue(granted);
    await requestPushPermission();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ importance: 4 }),
    );
  });
});

describe('getDevicePushToken', () => {
  it('returns the token with permission and a project id', async () => {
    expect(await getDevicePushToken()).toBe(TOKEN);
    expect(getToken).toHaveBeenCalledWith({ projectId: 'project-1' });
  });

  it('is null without permission, without project id and when the push service fails', async () => {
    permissions.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    expect(await getDevicePushToken()).toBeNull();
    permissions.mockResolvedValue(granted);
    (Constants.expoConfig as unknown) = { extra: {} };
    expect(await getDevicePushToken()).toBeNull();
    (Constants.expoConfig as unknown) = { extra: { eas: { projectId: 'project-1' } } };
    getToken.mockRejectedValue(new Error('offline'));
    expect(await getDevicePushToken()).toBeNull();
  });
});

describe('registerDevice', () => {
  it('CA-02: a visitor with permission registers token, platform and locale', async () => {
    expect(await registerDevice({ now: NOW })).toBe('registered');
    expect(mockInvoke).toHaveBeenCalledWith('register-device', {
      body: { token: TOKEN, platform: 'ios', locale: i18n.language },
    });
  });

  it('a second call on the same day is skipped, and force registers again', async () => {
    await registerDevice({ now: NOW });
    expect(await registerDevice({ now: new Date(NOW.getTime() + 60 * 60 * 1000) })).toBe('skipped');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(await registerDevice({ now: NOW, force: true })).toBe('registered');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('registers again after 24 hours', async () => {
    await registerDevice({ now: NOW });
    expect(await registerDevice({ now: new Date(NOW.getTime() + 25 * 60 * 60 * 1000) })).toBe(
      'registered',
    );
  });

  it('CA-03: changing from visitor to an account registers again, and back', async () => {
    await registerDevice({ now: NOW });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    expect(await registerDevice({ now: NOW })).toBe('registered');
    expect(await registerDevice({ now: NOW })).toBe('skipped');
    mockGetSession.mockResolvedValue({ data: { session: null } });
    expect(await registerDevice({ now: NOW })).toBe('registered');
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it('returns no_token without a token and does not call the function', async () => {
    permissions.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
    expect(await registerDevice({ now: NOW })).toBe('no_token');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('CA-04: a 429 is rate_limited and is not remembered; other errors are failed', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError({ status: 429 }) });
    expect(await registerDevice({ now: NOW })).toBe('rate_limited');
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('x')) });
    expect(await registerDevice({ now: NOW })).toBe('failed');
    mockInvoke.mockResolvedValue({ data: { status: 'registered' }, error: null });
    expect(await registerDevice({ now: NOW })).toBe('registered');
  });

  it('ignores a corrupted registration record', async () => {
    await AsyncStorage.setItem('push.lastRegistration.v1', '{not json');
    expect(await registerDevice({ now: NOW })).toBe('registered');
  });
});

describe('sendPush', () => {
  const input = { kind: 'event' as const, itemId: 'e1', audience: ['all' as const] };

  it('returns the number of recipients', async () => {
    mockInvoke.mockResolvedValue({ data: { recipients: 7 }, error: null });
    expect(await sendPush(input)).toEqual({ recipients: 7 });
    expect(mockInvoke).toHaveBeenCalledWith('send-push', { body: input });
  });

  it.each([
    ['CA-12', 403, 'forbidden', 'Você não tem permissão para avisar esta unidade.'],
    ['CA-13', 429, 'rate_limited', 'Aguarde 10 minutos para avisar de novo sobre este item.'],
    [
      'CA-23',
      502,
      'unavailable',
      'O item foi salvo, mas o aviso não foi enviado. Tente avisar de novo em instantes.',
    ],
  ])(
    '%s: status %i becomes PushError(%s) with the spec message',
    async (_ca, status, code, text) => {
      mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError({ status }) });
      const failure = await sendPush(input).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(PushError);
      expect((failure as PushError).code).toBe(code);
      expect(i18n.t(pushErrorMessageKey[(failure as PushError).code])).toBe(text);
    },
  );

  it('a network error becomes network with the connection message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('x')) });
    const failure = (await sendPush(input).catch((error: unknown) => error)) as PushError;
    expect(failure.code).toBe('network');
    expect(i18n.t(pushErrorMessageKey.network)).toBe(
      'Sem conexão. Verifique a internet e tente de novo.',
    );
  });

  it('any other status is unknown and uses the generic message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError({ status: 500 }) });
    const failure = (await sendPush(input).catch((error: unknown) => error)) as PushError;
    expect(failure.code).toBe('unknown');
    expect(pushErrorMessageKey.unknown).toBe('common.genericError');
  });
});

describe('enable push prompt', () => {
  it('requestEnablePushPrompt makes it pending and dismiss clears it', async () => {
    const { result } = await renderHook(() => useEnablePushPrompt());
    expect(result.current.pending).toBe(false);
    await act(async () => requestEnablePushPrompt());
    expect(result.current.pending).toBe(true);
    await act(async () => result.current.dismiss());
    expect(result.current.pending).toBe(false);
  });
});
