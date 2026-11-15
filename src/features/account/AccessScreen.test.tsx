import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { Membership } from '@/domain/permissions';

import { listAccess, revokeRole, type AccessEntry } from './api';
import { AccessScreen } from './AccessScreen';

let mockMemberships: Membership[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  listAccess: jest.fn(),
  revokeRole: jest.fn(),
  grantRole: jest.fn(),
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
    membershipId: 'm-estaca',
    userId: 'u-estaca',
    displayName: 'Daniela Exemplo',
    email: 'estaca@exemplo.org',
    unitId: 'estaca',
    role: 'stake_leader',
    leadershipGroup: 'stake_presidency',
  },
  {
    membershipId: 'm-bispo',
    userId: 'u-bispo',
    displayName: 'Carlos Exemplo',
    email: 'bispo@exemplo.org',
    unitId: 'criciuma1',
    role: 'unit_leader',
    leadershipGroup: 'bishops',
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
  mockMemberships = [{ unitId: 'estaca', role: 'stake_leader', leadershipGroup: null }];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (listAccess as jest.Mock).mockResolvedValue(entries);
  (revokeRole as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('AccessScreen', () => {
  it('CA-14: a member sees Acesso restrito and nothing is loaded', async () => {
    mockMemberships = [];
    await setup();
    expect(screen.getByText('Acesso restrito')).toBeTruthy();
    expect(listAccess).not.toHaveBeenCalled();
  });

  it('lists people grouped by unit with e-mail, role and group', async () => {
    await setup();
    expect(await screen.findByText('Daniela Exemplo')).toBeTruthy();
    expect(screen.getByText('Estaca')).toBeTruthy();
    expect(screen.getByText('Criciúma 1')).toBeTruthy();
    expect(screen.getByText('bispo@exemplo.org · Liderança da unidade · Bispos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conceder acesso' })).toBeTruthy();
  });

  it('CA-18: tapping the own item shows the message and does not call revokeRole', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('button', { name: /Daniela Exemplo/ }));
    expect(await screen.findByText('Você não pode remover o próprio acesso.')).toBeTruthy();
    expect(screen.queryByText('Remover acesso?')).toBeNull();
    expect(revokeRole).not.toHaveBeenCalled();
  });

  it('revoking another item asks first and calls revokeRole after the confirmation', async () => {
    await setup();
    await fireEvent.press(await screen.findByRole('button', { name: /Carlos Exemplo/ }));
    expect(screen.getByText('Remover acesso?')).toBeTruthy();
    expect(
      screen.getByText('Carlos Exemplo deixa de ter "Liderança da unidade" em Criciúma 1.'),
    ).toBeTruthy();
    expect(revokeRole).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(revokeRole).toHaveBeenCalledWith('m-bispo'));
  });
});
