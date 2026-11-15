import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Membership } from '@/domain/permissions';

import { fetchCallingCatalog } from './api';
import { testCatalog } from './callingFixtures';
import { CallingsCatalogScreen } from './CallingsCatalogScreen';

const mockPush = jest.fn();
let mockMemberships: Membership[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('./api', () => ({ ...jest.requireActual('./api'), fetchCallingCatalog: jest.fn() }));
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({ memberships: mockMemberships }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CallingsCatalogScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberships = [{ unitId: 'estaca', role: 'admin' }];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (fetchCallingCatalog as jest.Mock).mockResolvedValue(testCatalog);
});
afterEach(() => jest.restoreAllMocks());

const tab = (name: string) => screen.getByRole('tab', { name });

describe('CallingsCatalogScreen', () => {
  it('[roles] CA-20: a stake leader sees Acesso restrito and nothing is loaded', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'stake_leader' }];
    await setup();
    expect(screen.getByText('Acesso restrito')).toBeTruthy();
    expect(fetchCallingCatalog).not.toHaveBeenCalled();
  });

  it('lists the stake callings by sort order with level and access, the inactive one last', async () => {
    await setup();
    expect(await screen.findByText('Sumo Conselheiro')).toBeTruthy();
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((label) => /Sumo|Sociedade|Antigo/.test(label));
    expect(labels).toEqual([
      'Sumo Conselheiro, Estaca · Liderança da estaca',
      'Presidente da Sociedade de Socorro da Estaca, Estaca · Publicação da estaca',
      'Chamado Antigo, Estaca · Nenhum, Inativo',
    ]);
    expect(screen.getByText('Inativo')).toBeTruthy();
    expect(screen.queryByText('Bispo')).toBeNull();
  });

  it('the Alas e ramo tab lists the unit callings', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('tab', { name: 'Alas e ramo' }));
    expect(screen.getByText('Bispo')).toBeTruthy();
    expect(screen.getByText('Ala · Liderança da unidade')).toBeTruthy();
    expect(screen.getByText('Presidente do Ramo')).toBeTruthy();
    expect(screen.queryByText('Sumo Conselheiro')).toBeNull();
  });

  it('[roles] CA-17: searching primaria finds the Primária calling, ignoring the accent', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('tab', { name: 'Alas e ramo' }));
    await fireEvent.changeText(screen.getByLabelText('Buscar chamado'), 'primaria');
    expect(screen.getByText('Presidente da Primária')).toBeTruthy();
    expect(screen.queryByText('Bispo')).toBeNull();
  });

  it('a single character does not filter', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('tab', { name: 'Alas e ramo' }));
    await fireEvent.changeText(screen.getByLabelText('Buscar chamado'), 'p');
    expect(screen.getByText('Bispo')).toBeTruthy();
  });

  it('shows the empty message when nothing matches', async () => {
    await setup();
    await screen.findByText('Sumo Conselheiro');
    await fireEvent.changeText(screen.getByLabelText('Buscar chamado'), 'zzzz');
    expect(screen.getByText('Nenhum chamado encontrado para "zzzz".')).toBeTruthy();
  });

  it('the add action opens the form for a new calling', async () => {
    await setup();
    await screen.findByText('Sumo Conselheiro');
    await fireEvent.press(screen.getByRole('button', { name: 'Novo chamado' }));
    expect(mockPush).toHaveBeenCalledWith('/profile/callings-catalog/new');
    expect(tab('Estaca')).toBeTruthy();
  });

  it('tapping a calling opens its form', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('button', { name: /^Sumo Conselheiro/ }));
    expect(mockPush).toHaveBeenCalledWith('/profile/callings-catalog/high_councilor');
  });
});
