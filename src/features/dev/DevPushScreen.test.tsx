import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import { PushError, sendPush } from '@/lib/push';

import { DevPushRoute } from './DevPushScreen';

jest.mock('expo-router', () => ({ Redirect: () => null }));
jest.mock('@/lib/push', () => {
  class PushError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    PushError,
    sendPush: jest.fn(),
    pushErrorMessageKey: {
      forbidden: 'push.errors.forbidden',
      rate_limited: 'push.errors.rateLimited',
      unavailable: 'push.errors.unavailable',
      network: 'push.errors.network',
      unknown: 'common.genericError',
    },
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const originalDev = __DEV__;
const setDev = (value: boolean) => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
};

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        <DevPushRoute />
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setDev(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => setDev(originalDev));

describe('DevPushScreen', () => {
  it('renders nothing outside development', async () => {
    setDev(false);
    await setup();
    expect(screen.queryByText('Teste de envio de push')).not.toBeOnTheScreen();
  });

  it('the send button waits for an event id and an audience', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('ID do evento'), 'e1');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Toda a estaca' }));
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });

  it('sends and shows the number of recipients', async () => {
    (sendPush as jest.Mock).mockResolvedValue({ recipients: 3 });
    await setup();
    await fireEvent.changeText(screen.getByLabelText('ID do evento'), ' e1 ');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Toda a estaca' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    await act(async () => undefined);
    expect(sendPush).toHaveBeenCalledWith({
      kind: 'event',
      itemId: 'e1',
      audience: expect.arrayContaining(['all', 'primary']),
    });
    expect(screen.getByText('Enviado para 3 aparelho(s).')).toBeOnTheScreen();
  });

  it('shows the message of the error', async () => {
    (sendPush as jest.Mock).mockRejectedValue(new PushError('forbidden'));
    await setup();
    await fireEvent.changeText(screen.getByLabelText('ID do evento'), 'e1');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Toda a estaca' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
    await act(async () => undefined);
    expect(screen.getByText('Você não tem permissão para avisar esta unidade.')).toBeOnTheScreen();
  });
});
