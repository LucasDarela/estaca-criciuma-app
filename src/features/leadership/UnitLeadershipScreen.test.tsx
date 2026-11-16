import '@/i18n';

import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useIsOnline } from '@/lib/network';

import { linkRow, memberRow, newClient, Providers, rpcFor } from './testSupport';
import { UnitLeadershipScreen } from './UnitLeadershipScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockId = 'icara';
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({ id: mockId }),
  usePathname: () => '/leadership/unit/icara',
}));
jest.mock('@/lib/authSession', () => ({
  useAuthSession: () => ({ status: 'signedOut', expired: false }),
}));
jest.mock('@/lib/network', () => ({ useIsOnline: jest.fn() }));
let mockMemberships: { unitId: string; role: string }[] = [];
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({ memberships: mockMemberships }),
}));
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));

const members = [
  memberRow(
    'm2',
    'estaca',
    'high_council',
    'high_councilor',
    'Sumo Conselheiro',
    'Caetano Sumo',
    50,
  ),
  memberRow('m4', 'icara', 'bishopric', 'bishop', 'Bispo', 'Bispo Içara', 400),
  memberRow('m5', 'criciuma1', 'bishopric', 'bishop', 'Bispo', 'Bispo Criciúma', 400),
];
const links = [
  linkRow({ kind: 'high_council_unit', member_call_id: 'm2', target_unit_id: 'icara' }),
];

async function setup() {
  mockRpc.mockImplementation(rpcFor({ members, links }));
  await render(
    <Providers client={newClient()}>
      <UnitLeadershipScreen />
    </Providers>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberships = [];
  onlineManager.setOnline(true);
  (useIsOnline as jest.Mock).mockReturnValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('UnitLeadershipScreen', () => {
  it.each(['estaca', 'xyz'])('[leadership] CA-17: %s is not found', async (id) => {
    const user = userEvent.setup();
    mockId = id;
    await setup();
    expect(screen.getByText('Unidade não encontrada.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Voltar para Liderança' }));
    expect(mockReplace).toHaveBeenCalledWith('/leadership');
  });

  it('[leadership] CA-14: Acompanhada por lists the high councilor and opens the sheet', async () => {
    const user = userEvent.setup();
    mockId = 'icara';
    await setup();
    expect(await screen.findByRole('header', { name: 'ACOMPANHADA POR' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Içara' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Bispo Içara, Bispo')).toBeOnTheScreen();
    await user.press(screen.getByText('Caetano Sumo (Sumo Conselheiro)'));
    expect(await screen.findByText('Acompanha: Içara')).toBeOnTheScreen();
  });

  it('[leadership] CA-15: an empty branch shows the labels and the empty message', async () => {
    mockId = 'ramoGaivota';
    await setup();
    expect(
      await screen.findByText('Ainda não há pessoas no organograma desta unidade.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Presidente do Ramo, sem nome no organograma')).toBeOnTheScreen();
    expect(screen.getByLabelText('1º Conselheiro, sem nome no organograma')).toBeOnTheScreen();
    expect(screen.getByLabelText('2º Conselheiro, sem nome no organograma')).toBeOnTheScreen();
  });

  it('[leadership] the back button goes back', async () => {
    const user = userEvent.setup();
    mockId = 'icara';
    await setup();
    await user.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  describe('edit mode', () => {
    const roles = {
      estaca: [{ unitId: 'estaca', role: 'stake_leader' }],
      bispo: [{ unitId: 'criciuma1', role: 'unit_leader' }],
      publicador: [{ unitId: 'icara', role: 'unit_publisher' }],
      membro: [],
    };

    it.each([
      ['estaca', 'criciuma1', true],
      ['bispo', 'criciuma1', true],
      ['publicador', 'criciuma1', false],
      ['membro', 'criciuma1', false],
      ['bispo', 'icara', false],
    ] as const)('[leadership] CA-26: %s in %s sees Editar: %s', async (who, unit, sees) => {
      mockMemberships = roles[who];
      mockId = unit;
      await setup();
      await screen.findByText('Bispo');
      expect(!!screen.queryByRole('button', { name: 'Editar' })).toBe(sees);
    });

    it('[leadership] CA-28: editing shows the 5 blocks and saving Escola Dominical links it', async () => {
      const user = userEvent.setup();
      mockMemberships = roles.bispo;
      mockId = 'criciuma1';
      await setup();
      await user.press(await screen.findByRole('button', { name: 'Editar' }));
      expect(screen.getByText('Modo de edição')).toBeOnTheScreen();
      expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(
        expect.arrayContaining([
          'Quórum de Élderes',
          'Sociedade de Socorro',
          'Moças',
          'Primária',
          'Escola Dominical',
        ]),
      );
      expect(screen.getAllByText('Nenhuma pessoa no organograma.')).toHaveLength(5);
      await user.press(screen.getByLabelText('Editar: Escola Dominical'));
      await user.press(screen.getByRole('button', { name: '1º Conselheiro' }));
      await user.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Acompanhamento salvo')).toBeOnTheScreen();
      expect(mockRpc).toHaveBeenCalledWith('set_unit_org_counselor', {
        p_unit_id: 'criciuma1',
        p_organization: 'sunday_school',
        p_counselor_calling_id: 'bishopric_first_counselor',
      });
    });
  });
});
