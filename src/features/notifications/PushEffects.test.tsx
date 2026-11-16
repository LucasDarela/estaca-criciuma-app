import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AccessibilityInfo, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fetchInbox, markRead, type InboxItem } from '@/lib/notificationInbox';
import {
  configurePushPresentation,
  getPushPermission,
  registerDevice,
  requestEnablePushPrompt,
  requestPushPermission,
} from '@/lib/push';
import { useAuthSession } from '@/lib/authSession';

import { PushEffects } from './PushEffects';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/authSession', () => ({ useAuthSession: jest.fn() }));
jest.mock('@/lib/notificationInbox', () => ({
  fetchInbox: jest.fn(),
  markRead: jest.fn(),
  inboxQueryKey: (userId: string | null) => ['inbox', userId ?? 'visitor'],
}));
jest.mock('@/lib/push', () => {
  let pending = false;
  const listeners = new Set<() => void>();
  const react = jest.requireActual('react');
  const dismiss = () => {
    pending = false;
    listeners.forEach((l) => l());
  };
  return {
    configurePushPresentation: jest.fn(async () => undefined),
    getPushPermission: jest.fn(),
    registerDevice: jest.fn(async () => 'registered'),
    requestPushPermission: jest.fn(),
    requestEnablePushPrompt: jest.fn(() => {
      pending = true;
      listeners.forEach((l) => l());
    }),
    useEnablePushPrompt: () => ({
      pending: react.useSyncExternalStore(
        (l: () => void) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => pending,
      ),
      dismiss,
    }),
  };
});
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let tapListener: (response: unknown) => void = () => undefined;
const remove = jest.fn();
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <PushEffects />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function response(identifier: string, data: unknown) {
  return { notification: { request: { identifier, content: { data } } } };
}

const inboxItem: InboxItem = {
  id: 'n1',
  kind: 'event',
  itemId: 'e1',
  unitId: 'icara',
  title: 'Batismo',
  body: '',
  at: new Date('2026-11-15T13:00:00Z'),
  read: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  client.clear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (useAuthSession as jest.Mock).mockReturnValue({ status: 'signedOut', expired: false });
  (getPushPermission as jest.Mock).mockResolvedValue('undetermined');
  (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
    (listener: (response: unknown) => void) => {
      tapListener = listener;
      return { remove };
    },
  );
  (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);
  (fetchInbox as jest.Mock).mockResolvedValue([inboxItem]);
  (markRead as jest.Mock).mockResolvedValue(undefined);
});

describe('PushEffects', () => {
  it('configures the presentation and registers the device when the app opens', async () => {
    await render(<Harness />);
    expect(configurePushPresentation).toHaveBeenCalledTimes(1);
    expect(registerDevice).toHaveBeenCalledWith();
  });

  it('registers again when the app returns to the foreground', async () => {
    let listener: (status: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (status: string) => void;
      return { remove: jest.fn() };
    });
    await render(<Harness />);
    (registerDevice as jest.Mock).mockClear();
    await act(async () => listener('active'));
    expect(registerDevice).toHaveBeenCalledTimes(1);
  });

  it('CA-03: changing the signed-in user registers again with force', async () => {
    const view = await render(<Harness />);
    (registerDevice as jest.Mock).mockClear();
    (useAuthSession as jest.Mock).mockReturnValue({
      status: 'signedIn',
      userId: 'u1',
      email: 'a@b.co',
    });
    await view.rerender(<Harness />);
    expect(registerDevice).toHaveBeenCalledWith({ force: true });

    (registerDevice as jest.Mock).mockClear();
    (useAuthSession as jest.Mock).mockReturnValue({ status: 'signedOut', expired: false });
    await view.rerender(<Harness />);
    expect(registerDevice).toHaveBeenCalledWith({ force: true });
  });

  it('CA-03: the same user does not force a new registration', async () => {
    const view = await render(<Harness />);
    (registerDevice as jest.Mock).mockClear();
    await view.rerender(<Harness />);
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('CA-17: tapping an event notification opens /event/{id} and marks it read', async () => {
    await render(<Harness />);
    await act(async () => tapListener(response('id-1', { kind: 'event', itemId: 'e1' })));
    expect(mockPush).toHaveBeenCalledWith('/event/e1');
    expect(markRead).toHaveBeenCalledWith(['n1'], [inboxItem], client);
  });

  it('a post notification opens /board/{id}', async () => {
    (fetchInbox as jest.Mock).mockResolvedValue([]);
    await render(<Harness />);
    await act(async () => tapListener(response('id-2', { kind: 'post', itemId: 'p1' })));
    expect(mockPush).toHaveBeenCalledWith('/board/p1');
    expect(markRead).not.toHaveBeenCalled();
  });

  it('the same notification tapped twice navigates once', async () => {
    await render(<Harness />);
    await act(async () => tapListener(response('id-1', { kind: 'event', itemId: 'e1' })));
    await act(async () => tapListener(response('id-1', { kind: 'event', itemId: 'e1' })));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('CA-17: the notification that opened the closed app is handled too', async () => {
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(
      response('id-3', { kind: 'event', itemId: 'e1' }),
    );
    await render(<Harness />);
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledWith('/event/e1');
  });

  it('ignores a notification whose data this app did not send', async () => {
    await render(<Harness />);
    await act(async () => tapListener(response('id-4', { kind: 'other', itemId: 'x' })));
    await act(async () => tapListener(response('id-5', null)));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the item even when marking it read fails', async () => {
    (fetchInbox as jest.Mock).mockRejectedValue(new Error('offline'));
    await render(<Harness />);
    await act(async () => tapListener(response('id-6', { kind: 'event', itemId: 'e1' })));
    expect(mockPush).toHaveBeenCalledWith('/event/e1');
  });

  it('removes the listener on unmount', async () => {
    const view = await render(<Harness />);
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('CA-05: with the prompt pending and permission undetermined the sheet shows', async () => {
    await render(<Harness />);
    await act(async () => requestEnablePushPrompt());
    expect(screen.getByText('Receber avisos?')).toBeOnTheScreen();

    (requestPushPermission as jest.Mock).mockResolvedValue('granted');
    await fireEvent.press(screen.getByRole('button', { name: 'Ativar avisos' }));
    await act(async () => undefined);
    expect(requestPushPermission).toHaveBeenCalled();
    expect(registerDevice).toHaveBeenCalledWith({ force: true });
  });

  it('"Agora não" closes the sheet without asking for permission', async () => {
    await render(<Harness />);
    await act(async () => requestEnablePushPrompt());
    await fireEvent.press(screen.getByRole('button', { name: 'Agora não' }));
    await act(async () => undefined);
    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(screen.queryByText('Receber avisos?')).not.toBeOnTheScreen();
  });

  it('with the permission already granted there is no sheet; the device is linked to the account', async () => {
    (getPushPermission as jest.Mock).mockResolvedValue('granted');
    await render(<Harness />);
    (registerDevice as jest.Mock).mockClear();
    await act(async () => requestEnablePushPrompt());
    expect(screen.queryByText('Receber avisos?')).not.toBeOnTheScreen();
    expect(registerDevice).toHaveBeenCalledWith({ force: true });
  });

  it('with the permission denied there is no sheet and nothing is registered', async () => {
    (getPushPermission as jest.Mock).mockResolvedValue('denied');
    await render(<Harness />);
    (registerDevice as jest.Mock).mockClear();
    await act(async () => requestEnablePushPrompt());
    expect(screen.queryByText('Receber avisos?')).not.toBeOnTheScreen();
    expect(registerDevice).not.toHaveBeenCalled();
  });
});
