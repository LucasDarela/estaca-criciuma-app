import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import { useIsOnline } from '@/lib/network';
import { itemExists, useInbox, useMarkRead, type InboxItem } from '@/lib/notificationInbox';
import { getPushPermission, registerDevice, requestPushPermission } from '@/lib/push';

import { NotificationsScreen } from './NotificationsScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('@/lib/network');
jest.mock('@/lib/notificationInbox', () => ({
  useInbox: jest.fn(),
  useMarkRead: jest.fn(),
  itemExists: jest.fn(),
}));
jest.mock('@/lib/push', () => ({
  getPushPermission: jest.fn(),
  registerDevice: jest.fn(),
  requestPushPermission: jest.fn(),
}));
jest.mock('./NotificationPrefsCard', () => ({
  NotificationPrefsCard: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>prefs-card</Text>;
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// 15/11/2026 12:00 in Sao Paulo
const NOW = new Date('2026-11-15T15:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'n1',
    kind: 'event',
    itemId: 'e1',
    unitId: 'icara',
    title: 'Batismo',
    body: 'Sábado, 21 de novembro · 15:00 · Capela',
    at: new Date('2026-11-15T13:00:00Z'), // 10:00
    read: false,
    ...overrides,
  };
}

const markRead = jest.fn();

function mockInbox(
  data: InboxItem[],
  state: Partial<{ isPending: boolean; isError: boolean; isSuccess: boolean }> = {},
) {
  (useInbox as jest.Mock).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: jest.fn(),
    ...state,
  });
}

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        <NotificationsScreen />
      </ToastProvider>
    </SafeAreaProvider>,
  );
  await act(async () => undefined);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (useIsOnline as jest.Mock).mockReturnValue(true);
  (useMarkRead as jest.Mock).mockReturnValue(markRead);
  markRead.mockResolvedValue(undefined);
  (itemExists as jest.Mock).mockResolvedValue(true);
  (getPushPermission as jest.Mock).mockResolvedValue('granted');
  mockInbox([item()]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('NotificationsScreen', () => {
  it('CA-15: groups notifications in today, this week and earlier, and hides the ones past 90 days', async () => {
    mockInbox([
      item({ id: 'today', title: 'De hoje' }),
      item({ id: 'week', title: 'Da semana', at: daysAgo(3) }),
      item({ id: 'old', title: 'Antiga', at: daysAgo(20) }),
      item({ id: 'gone', title: 'Muito antiga', at: daysAgo(100) }),
    ]);
    await setup();
    expect(screen.getByText('HOJE')).toBeOnTheScreen();
    expect(screen.getByText('ESTA SEMANA')).toBeOnTheScreen();
    expect(screen.getByText('ANTERIORES')).toBeOnTheScreen();
    expect(screen.getByText('De hoje')).toBeOnTheScreen();
    expect(screen.getByText('Da semana')).toBeOnTheScreen();
    expect(screen.getByText('Antiga')).toBeOnTheScreen();
    expect(screen.queryByText('Muito antiga')).not.toBeOnTheScreen();
  });

  it('RF-15: shows unit and time for an event and the event icon', async () => {
    await setup();
    expect(screen.getByText('Içara · 10:00')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-icon-event')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-unread-dot')).toBeOnTheScreen();
  });

  it('RF-15: a post uses the campaign icon', async () => {
    mockInbox([item({ kind: 'post', body: 'Aviso importante' })]);
    await setup();
    expect(screen.getByTestId('notification-icon-campaign')).toBeOnTheScreen();
  });

  it('CA-19: a reminder shows "Minhas anotações · dia" with the alarm icon', async () => {
    mockInbox([
      item({
        id: 'reminder:r1:2026-11-14T12:00:00.000Z',
        kind: 'reminder',
        itemId: 'r1',
        unitId: null,
        title: 'Ligar para o bispo',
        body: '',
        at: new Date('2026-11-14T12:00:00Z'),
      }),
    ]);
    await setup();
    expect(screen.getByText('Ligar para o bispo')).toBeOnTheScreen();
    expect(screen.getByText(/^Minhas anotações · /)).toBeOnTheScreen();
    expect(screen.getByTestId('notification-icon-alarm')).toBeOnTheScreen();
  });

  it('RNF-09: an unread item announces "Não lida" before the title, a read one does not', async () => {
    mockInbox([item(), item({ id: 'n2', title: 'Já lida', read: true })]);
    await setup();
    expect(screen.getByRole('button', { name: /^Não lida, Batismo/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Já lida/ })).toBeOnTheScreen();
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(1);
  });

  it('CA-16: "Ler todas" marks everything as read and only shows with unread items', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Ler todas' }));
    expect(markRead).toHaveBeenCalledWith(null, [expect.objectContaining({ id: 'n1' })]);
  });

  it('CA-16: with everything read there is no "Ler todas"', async () => {
    mockInbox([item({ read: true })]);
    await setup();
    expect(screen.queryByRole('button', { name: 'Ler todas' })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('notification-unread-dot')).not.toBeOnTheScreen();
  });

  it('CA-17: tapping an event marks it read and opens /event/{id}', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /Batismo/ }));
    await act(async () => undefined);
    expect(markRead).toHaveBeenCalledWith(['n1'], [expect.objectContaining({ id: 'n1' })]);
    expect(mockPush).toHaveBeenCalledWith('/event/e1');
  });

  it('RF-16: an item that no longer exists shows a toast and does not navigate', async () => {
    (itemExists as jest.Mock).mockResolvedValue(false);
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /Batismo/ }));
    await act(async () => undefined);
    expect(screen.getByText('Este item não está mais disponível.')).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('RF-16: if the existence check fails (offline) it still opens the item', async () => {
    (itemExists as jest.Mock).mockRejectedValue(new Error('offline'));
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /Batismo/ }));
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledWith('/event/e1');
  });

  it('a failure while marking as read shows the generic error but still opens the item', async () => {
    markRead.mockRejectedValue(new Error('down'));
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /Batismo/ }));
    await act(async () => undefined);
    expect(screen.getByText('Algo deu errado. Tente de novo.')).toBeOnTheScreen();
    expect(mockPush).toHaveBeenCalledWith('/event/e1');
  });

  it('RF-18: an empty history shows the empty message', async () => {
    mockInbox([]);
    await setup();
    expect(screen.getByText('Nenhuma notificação nos últimos 90 dias.')).toBeOnTheScreen();
  });

  it('shows an error with retry when the history cannot load', async () => {
    mockInbox([], { isError: true, isSuccess: false });
    await setup();
    expect(screen.getByText('Algo deu errado. Tente de novo.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });

  it('the back button goes back', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('permission card', () => {
  it('CA-06: denied permission shows the settings text and the open settings button', async () => {
    (getPushPermission as jest.Mock).mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await setup();
    expect(
      screen.getByText('As notificações estão desativadas nas configurações do celular.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir configurações' }));
    expect(openSettings).toHaveBeenCalled();
    expect(screen.queryByText('prefs-card')).not.toBeOnTheScreen();
  });

  it('RF-06: undetermined permission offers "Ativar avisos", which asks and registers', async () => {
    (getPushPermission as jest.Mock).mockResolvedValue('undetermined');
    (requestPushPermission as jest.Mock).mockResolvedValue('granted');
    await setup();
    expect(
      screen.getByText('Receba avisos da estaca e das unidades que escolher.'),
    ).toBeOnTheScreen();
    (getPushPermission as jest.Mock).mockResolvedValue('granted');
    await fireEvent.press(screen.getByRole('button', { name: 'Ativar avisos' }));
    await act(async () => undefined);
    expect(requestPushPermission).toHaveBeenCalled();
    expect(registerDevice).toHaveBeenCalledWith({ force: true });
    expect(screen.getByText('prefs-card')).toBeOnTheScreen();
  });

  it('a refused system dialog does not register', async () => {
    (getPushPermission as jest.Mock).mockResolvedValue('undetermined');
    (requestPushPermission as jest.Mock).mockResolvedValue('denied');
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Ativar avisos' }));
    await act(async () => undefined);
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it('a device that is not a phone says notices only work on a phone', async () => {
    (getPushPermission as jest.Mock).mockResolvedValue('unsupported');
    await setup();
    expect(screen.getByText('Avisos só funcionam em um celular.')).toBeOnTheScreen();
  });

  it('with permission granted the preferences card shows', async () => {
    await setup();
    expect(screen.getByText('prefs-card')).toBeOnTheScreen();
  });
});
