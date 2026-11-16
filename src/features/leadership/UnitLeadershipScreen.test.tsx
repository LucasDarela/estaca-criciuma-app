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
});
