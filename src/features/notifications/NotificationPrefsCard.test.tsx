import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import { unitIds, type UnitId } from '@/domain/units';
import { getDevicePushToken } from '@/lib/push';

import { fetchDeviceUnits, setDeviceUnits } from './api';
import { NotificationPrefsCard } from './NotificationPrefsCard';

jest.mock('./api');
jest.mock('@/lib/push', () => ({ getDevicePushToken: jest.fn() }));
let mockHome: UnitId | null = 'icara';
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({ profile: mockHome ? { homeUnitId: mockHome } : null }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// The query client notifies through a timer, so a microtask flush is not enough.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
        }
      >
        <ToastProvider>
          <NotificationPrefsCard />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHome = 'icara';
  (getDevicePushToken as jest.Mock).mockResolvedValue('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
  (fetchDeviceUnits as jest.Mock).mockResolvedValue([...unitIds]);
  (setDeviceUnits as jest.Mock).mockResolvedValue(undefined);
});

describe('NotificationPrefsCard', () => {
  it('RF-17: with a home unit shows Estaca, my ward and other units', async () => {
    await setup();
    expect(screen.getByText('Receber avisos de')).toBeOnTheScreen();
    expect(screen.getByText('Estaca')).toBeOnTheScreen();
    expect(screen.getByText('Minha ala · Içara')).toBeOnTheScreen();
    expect(screen.getByText('Outras unidades')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Receber avisos da Estaca' })).toBeChecked();
  });

  it('RF-17: a branch is "Meu ramo"', async () => {
    mockHome = 'ramoGaivota';
    await setup();
    expect(screen.getByText('Meu ramo · Ramo Gaivota')).toBeOnTheScreen();
  });

  it('CA-18: turning off "Outras unidades" saves only the stake and the home unit', async () => {
    await setup();
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Receber avisos de outras unidades' }),
    );
    await settle();
    expect(setDeviceUnits).toHaveBeenCalledWith('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', [
      'estaca',
      'icara',
    ]);
    expect(
      screen.getByRole('switch', { name: 'Receber avisos de outras unidades' }),
    ).not.toBeChecked();
  });

  it('RNF-10: the switches are labeled with the unit', async () => {
    await setup();
    expect(screen.getByRole('switch', { name: 'Receber avisos da Estaca' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Receber avisos da Içara' })).toBeOnTheScreen();
  });

  it('RF-17: without a home unit there is one switch per unit', async () => {
    mockHome = null;
    (fetchDeviceUnits as jest.Mock).mockResolvedValue(['estaca']);
    await setup();
    expect(screen.getAllByRole('switch')).toHaveLength(7);
    await fireEvent.press(screen.getByRole('switch', { name: 'Receber avisos da Criciúma 2' }));
    await settle();
    expect(setDeviceUnits).toHaveBeenCalledWith('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', [
      'estaca',
      'criciuma2',
    ]);
  });

  it('a failure puts the switch back and shows the generic error', async () => {
    (setDeviceUnits as jest.Mock).mockRejectedValue(new Error('down'));
    await setup();
    await fireEvent.press(screen.getByRole('switch', { name: 'Receber avisos da Estaca' }));
    await settle();
    expect(screen.getByRole('switch', { name: 'Receber avisos da Estaca' })).toBeChecked();
    expect(screen.getByText('Algo deu errado. Tente de novo.')).toBeOnTheScreen();
  });

  it('a device that is not registered yet starts with the stake only', async () => {
    (fetchDeviceUnits as jest.Mock).mockResolvedValue(null);
    await setup();
    expect(screen.getByRole('switch', { name: 'Receber avisos da Estaca' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Receber avisos da Içara' })).not.toBeChecked();
  });

  it('renders nothing without a token', async () => {
    (getDevicePushToken as jest.Mock).mockResolvedValue(null);
    await setup();
    expect(screen.queryByText('Receber avisos de')).not.toBeOnTheScreen();
  });
});
