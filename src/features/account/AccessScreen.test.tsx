import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { Membership } from '@/domain/permissions';

import { listAccess, revokeAdmin, revokeCalling, type AccessEntry } from './api';
import { AccessScreen } from './AccessScreen';

let mockMemberships: Membership[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  listAccess: jest.fn(),
  revokeCalling: jest.fn(),
  revokeAdmin: jest.fn(),
  grantCalling: jest.fn(),
  grantAdmin: jest.fn(),
  fetchCallingCatalog: jest.fn().mockResolvedValue([]),
}));
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({ userId: 'u-estaca', memberships: mockMemberships }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const entries: AccessEntry[] = [
  {
    entryId: 'mc-estaca',
    kind: 'calling',
    userId: 'u-estaca',
    displayName: 'Daniela Exemplo',
    email: 'estaca@exemplo.org',
    unitId: 'estaca',
    calling: {
      id: 'stake_first_counselor',
      namePt: 'Primeiro Conselheiro na Presidência da Estaca',
      nameEn: null,
      nameEs: null,
    },
  },
  {
    entryId: 'm-admin',
    kind: 'admin',
    userId: 'u-admin',
    displayName: 'Eduardo Exemplo',
    email: 'admin@exemplo.org',
    unitId: 'estaca',
    calling: null,
  },
  {
    entryId: 'mc-bispo',
    kind: 'calling',
    userId: 'u-bispo',
    displayName: 'Carlos Exemplo',
    email: 'bispo@exemplo.org',
    unitId: 'criciuma1',
    calling: { id: 'bishop', namePt: 'Bispo', nameEn: 'Bishop', nameEs: 'Obispo' },
  },
];

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <AccessScreen />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberships = [{ unitId: 'estaca', role: 'stake_leader' }];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (listAccess as jest.Mock).mockResolvedValue(entries);
  (revokeCalling as jest.Mock).mockResolvedValue(undefined);
  (revokeAdmin as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('AccessScreen', () => {
  it('CA-14: a member sees Acesso restrito and nothing is loaded', async () => {
    mockMemberships = [];
    await setup();
    expect(screen.getByText('Acesso restrito')).toBeTruthy();
    expect(listAccess).not.toHaveBeenCalled();
  });

  it('[roles] CA-09: lists people grouped by unit with e-mail and calling', async () => {
    await setup();
    expect(await screen.findByText('Daniela Exemplo')).toBeTruthy();
    expect(screen.getByText('Estaca')).toBeTruthy();
    expect(screen.getByText('Criciúma 1')).toBeTruthy();
    expect(screen.getByText('bispo@exemplo.org · Bispo')).toBeTruthy();
    expect(screen.getByText('admin@exemplo.org · Administração')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conceder acesso' })).toBeTruthy();
  });

  it('[roles] RNF-07: each item is announced as name, calling, unit', async () => {
    await setup();
    expect(
      await screen.findByRole('button', { name: 'Carlos Exemplo, Bispo, Criciúma 1' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Eduardo Exemplo, Administração, Estaca' }),
    ).toBeTruthy();
  });

  it('CA-18: tapping the own item shows the message and does not revoke', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('button', { name: /Daniela Exemplo/ }));
    expect(await screen.findByText('Você não pode remover o próprio acesso.')).toBeTruthy();
    expect(screen.queryByText('Remover chamado?')).toBeNull();
    expect(revokeCalling).not.toHaveBeenCalled();
  });

  it('[roles] CA-12: removing a calling asks first, calls revokeCalling and shows the toast', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('button', { name: /Carlos Exemplo/ }));
    expect(screen.getByText('Remover chamado?')).toBeTruthy();
    expect(
      screen.getByText('Carlos Exemplo deixa de ter o chamado "Bispo" em Criciúma 1.'),
    ).toBeTruthy();
    expect(revokeCalling).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(revokeCalling).toHaveBeenCalledWith('mc-bispo'));
    expect(await screen.findByText('Chamado removido')).toBeTruthy();
  });

  it('[roles] removing Administração calls revokeAdmin with the user id', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'admin' }];
    await setup();
    await fireEvent.press(await screen.findByRole('button', { name: /Eduardo Exemplo/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(revokeAdmin).toHaveBeenCalledWith('u-admin'));
    expect(revokeCalling).not.toHaveBeenCalled();
  });
});
