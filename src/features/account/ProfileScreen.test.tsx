import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '@/i18n';
import type { MemberCall } from '@/domain/callings';
import type { Membership } from '@/domain/permissions';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { signOut } from '@/lib/authSession';

import { exportMyData, fetchMyPhone, setMyPhone, updateProfile } from './api';
import { bishop } from './callingFixtures';
import { ProfileScreen } from './ProfileScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockMemberships: Membership[] = [];
let mockCalls: MemberCall[] = [];
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  updateProfile: jest.fn(),
  exportMyData: jest.fn(),
  fetchMyPhone: jest.fn(),
  setMyPhone: jest.fn(),
}));
jest.mock('@/lib/authSession', () => ({
  signOut: jest.fn(),
  useAuthSession: () => ({ status: 'signedIn', userId: 'u1', email: 'ana@exemplo.org' }),
}));
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({
    userId: 'u1',
    memberships: mockMemberships,
    calls: mockCalls,
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
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
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
  mockCalls = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (updateProfile as jest.Mock).mockResolvedValue(undefined);
  (fetchMyPhone as jest.Mock).mockResolvedValue(null);
  (setMyPhone as jest.Mock).mockResolvedValue(undefined);
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

  it('[roles] CA-20: Catálogo de chamados does not appear for a stake leader', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'stake_leader' }];
    await setup();
    expect(screen.queryByRole('button', { name: 'Catálogo de chamados' })).toBeNull();
  });

  it('[roles] Catálogo de chamados appears for an admin and opens the catalog', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'admin' }];
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Catálogo de chamados' }));
    expect(mockPush).toHaveBeenCalledWith('/profile/callings-catalog');
  });

  it('[roles] a profile without callings shows neither the section nor the consent card', async () => {
    await setup();
    expect(screen.queryByText('MEUS CHAMADOS')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
  });

  it('[roles] CA-13: a pending calling shows the consent card and the section', async () => {
    mockCalls = [{ id: 'mc1', unitId: 'criciuma1', calling: bishop, orgChartConsent: 'pending' }];
    await setup();
    expect(screen.getByRole('button', { name: 'Mostrar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy();
    expect(screen.getByText('MEUS CHAMADOS')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Mostrar Bispo no organograma' })).toBeTruthy();
  });

  it('[roles] CA-22: a person with a calling sees the locked-unit message when changing the unit', async () => {
    const { AccountError } = jest.requireActual('./api');
    mockCalls = [{ id: 'mc1', unitId: 'criciuma1', calling: bishop, orgChartConsent: 'accepted' }];
    (updateProfile as jest.Mock).mockRejectedValue(new AccountError('home_unit_locked'));
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: /^Unidade/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Içara' }));
    expect(
      await screen.findByText(
        'Para mudar de unidade, peça à liderança da estaca para remover seus acessos primeiro.',
      ),
    ).toBeTruthy();
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

  it('[leadership] a failed phone load is not shown as "Não informado"', async () => {
    (fetchMyPhone as jest.Mock).mockRejectedValue(new Error('boom'));
    await setup();
    expect(
      await screen.findByRole('button', { name: 'Telefone, Algo deu errado. Tente de novo.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Telefone, Não informado' })).toBeNull();
  });

  it('[leadership] CA-24: the Telefone row follows Idioma and saving it updates the subtitle', async () => {
    (fetchMyPhone as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ phoneE164: '+5548999990000', showOnOrgChart: true });
    await setup();
    await screen.findByRole('button', { name: 'Telefone, Não informado' });
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
    expect(labels.slice(2, 4)).toEqual(['Idioma, Português (Brasil)', 'Telefone, Não informado']);
    await fireEvent.press(screen.getByRole('button', { name: 'Telefone, Não informado' }));
    await fireEvent.changeText(screen.getByPlaceholderText('(48) 99999-0000'), '48999990000');
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Mostrar meu telefone no organograma' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(setMyPhone).toHaveBeenCalledWith('+5548999990000', true));
    expect(await screen.findByText('Telefone salvo')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Telefone, (48) 99999-0000' })).toBeTruthy();
  });
});
