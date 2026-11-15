import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '@/i18n';
import type { Membership } from '@/domain/permissions';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { signOut } from '@/lib/authSession';

import { exportMyData, updateProfile } from './api';
import { ProfileScreen } from './ProfileScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockMemberships: Membership[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  updateProfile: jest.fn(),
  exportMyData: jest.fn(),
}));
jest.mock('@/lib/authSession', () => ({
  signOut: jest.fn(),
  useAuthSession: () => ({ status: 'signedIn', userId: 'u1', email: 'ana@exemplo.org' }),
}));
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({
    userId: 'u1',
    memberships: mockMemberships,
    profile: { displayName: 'Ana Souza', homeUnitId: null, locale: 'pt-BR' },
  }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ProfileScreen />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockMemberships = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (updateProfile as jest.Mock).mockResolvedValue(undefined);
  (exportMyData as jest.Mock).mockResolvedValue(undefined);
  (signOut as jest.Mock).mockResolvedValue(undefined);
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => jest.restoreAllMocks());

describe('ProfileScreen', () => {
  it('shows the name, the e-mail and the items in order, with Excluir conta last', async () => {
    await setup();
    expect(screen.getByText('ana@exemplo.org')).toBeTruthy();
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((label) => label !== 'Fechar');
    expect(labels.slice(0, 3)).toEqual([
      'Nome, Ana Souza',
      'Unidade, Não informada',
      'Idioma, Português (Brasil)',
    ]);
    expect(labels).toContain('Exportar meus dados');
    expect(labels[labels.length - 1]).toBe('Excluir conta');
  });

  it('CA-14: Acessos does not appear for a member', async () => {
    await setup();
    expect(screen.queryByRole('button', { name: 'Acessos' })).toBeNull();
  });

  it('Acessos appears for a stake leader and opens /profile/access', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'stake_leader' }];
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Acessos' }));
    expect(mockPush).toHaveBeenCalledWith('/profile/access');
  });

  it('CA-11: choosing English (US) switches the text at once and saves locale en-US', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /^Idioma/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'English (US)' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith('u1', { locale: 'en-US' }));
    expect(await screen.findByText('Profile')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export my data' })).toBeTruthy();
  });

  it('editing the name saves it and shows the toast', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /^Nome/ }));
    await fireEvent.changeText(screen.getAllByLabelText('Nome').at(-1)!, 'Ana Maria');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith('u1', { displayName: 'Ana Maria' }),
    );
    expect(await screen.findByText('Perfil atualizado')).toBeTruthy();
  });

  it('a 1-character name is rejected with the RF-09 message', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /^Nome/ }));
    await fireEvent.changeText(screen.getAllByLabelText('Nome').at(-1)!, 'A');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Use entre 2 e 60 caracteres.')).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('choosing a unit saves it', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /^Unidade/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Içara' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith('u1', { homeUnitId: 'icara' }));
  });

  it('CA-26: a locked unit shows the message in the sheet and keeps the unit', async () => {
    const { AccountError } = jest.requireActual('./api');
    (updateProfile as jest.Mock).mockRejectedValue(new AccountError('home_unit_locked'));
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /^Unidade/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Içara' }));
    expect(
      await screen.findByText(
        'Para mudar de unidade, peça à liderança da estaca para remover seus acessos primeiro.',
      ),
    ).toBeTruthy();
    // The sheet stays open and the screen still shows the saved unit (none).
    expect(screen.getByRole('button', { name: 'Unidade, Não informada' })).toBeTruthy();
    expect(screen.queryByText('Perfil atualizado')).toBeNull();
  });

  it('exports the data and shows the offline toast on a network failure', async () => {
    const { AccountError } = jest.requireActual('./api');
    (exportMyData as jest.Mock).mockRejectedValue(new AccountError('network'));
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Exportar meus dados' }));
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeTruthy();
  });

  it('Sair signs out and goes to /agenda', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/agenda'));
    expect(signOut).toHaveBeenCalled();
  });
});
