import '@/i18n';

import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { makeCalled } from '@/domain/orgChartFixtures';
import { useIsOnline } from '@/lib/network';

import { LeadershipScreen } from './LeadershipScreen';
import { linkRow, memberRow, newClient, Providers, rpcFor, seedCache } from './testSupport';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/leadership',
}));
jest.mock('@/lib/authSession', () => ({
  useAuthSession: () => ({ status: 'signedIn', userId: 'u1', email: 'ana@exemplo.org' }),
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
    'm1',
    'estaca',
    'stake_presidency',
    'stake_president',
    'Presidente da Estaca',
    'Antônio Presidente',
    10,
  ),
  memberRow(
    'm2',
    'estaca',
    'high_council',
    'high_councilor',
    'Sumo Conselheiro',
    'Caetano Sumo',
    50,
  ),
  memberRow(
    'm3',
    'estaca',
    'stake_clerks',
    'stake_executive_secretary',
    'Secretário Executivo da Estaca',
    'Ildefonso Secretário',
    60,
  ),
  memberRow('m4', 'criciuma1', 'bishopric', 'bishop', 'Bispo', 'Bispo Criciúma', 400),
  memberRow(
    'm5',
    'criciuma1',
    'bishopric',
    'bishopric_first_counselor',
    'Primeiro Conselheiro do Bispado',
    'Raimundo Conselheiro',
    410,
  ),
  memberRow(
    'm6',
    'criciuma1',
    'unit_clerks',
    'unit_clerk',
    'Secretário',
    'Ubirajara Secretário',
    580,
  ),
  memberRow(
    'm7',
    'ramoGaivota',
    'bishopric',
    'branch_president',
    'Presidente do Ramo',
    'Belmiro Ramo',
    530,
  ),
  memberRow(
    'm8',
    'icara',
    'unit_organizations',
    'primary_president',
    'Presidente da Primária',
    'Odete Primária',
    1000,
  ),
];
const links = [
  linkRow({ kind: 'high_council_unit', member_call_id: 'm2', target_unit_id: 'icara' }),
];

let client = newClient();

async function setup(data: { members?: unknown[]; links?: unknown[] } = { members, links }) {
  mockRpc.mockImplementation(rpcFor(data));
  await render(
    <Providers client={client}>
      <LeadershipScreen />
    </Providers>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberships = [];
  client = newClient();
  onlineManager.setOnline(true);
  (useIsOnline as jest.Mock).mockReturnValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('LeadershipScreen', () => {
  it('[leadership] CA-20: the tab calls only the members and links functions', async () => {
    await setup();
    expect(
      await screen.findByLabelText('Antônio Presidente, Presidente da Estaca'),
    ).toBeOnTheScreen();
    const names = mockRpc.mock.calls.map(([name]) => name).sort();
    expect(names).toEqual(['org_chart_links', 'org_chart_members']);
  });

  it('[leadership] RF-14: opens on Estaca with the stake tree', async () => {
    await setup();
    expect(await screen.findByText('Presidente')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Liderança' })).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Buscar nome ou chamado')).toBeOnTheScreen();
    expect(screen.getByText('SECRETÁRIOS DA ESTACA')).toBeOnTheScreen();
  });

  it('[leadership] CA-16: Unidades lists the 6 units in order and opens one', async () => {
    const user = userEvent.setup();
    await setup();
    await screen.findByText('Presidente');
    await user.press(screen.getByText('Unidades'));
    const items = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((label) => /· \d+$/.test(label ?? ''));
    expect(items).toEqual([
      'Criciúma 1, Bispado · 2',
      'Criciúma 2, Bispado · 0',
      'Criciúma 3, Bispado · 0',
      'Içara, Bispado · 0',
      'Araranguá, Bispado · 0',
      'Ramo Gaivota, Presidência do ramo · 1',
    ]);
    await user.press(screen.getByLabelText('Criciúma 1, Bispado · 2'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/leadership/unit/[id]',
      params: { id: 'criciuma1' },
    });
  });

  it('[leadership] CA-18: searching secretario lists the clerks with calling and unit', async () => {
    const user = userEvent.setup();
    await setup();
    await screen.findByText('Presidente');
    await user.type(screen.getByPlaceholderText('Buscar nome ou chamado'), 'secretario');
    expect(
      screen.getByLabelText('Ildefonso Secretário, Secretário Executivo da Estaca · Estaca'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Ubirajara Secretário, Secretário · Criciúma 1'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('SECRETÁRIOS DA ESTACA')).not.toBeOnTheScreen();
  });

  it('[leadership] CA-18: no match shows the empty message; one character keeps the normal content', async () => {
    const user = userEvent.setup();
    await setup();
    await screen.findByText('Presidente');
    const field = screen.getByPlaceholderText('Buscar nome ou chamado');
    await user.type(field, 'zzz');
    expect(screen.getByText('Ninguém encontrado para "zzz".')).toBeOnTheScreen();
    await user.clear(field);
    await user.type(field, 's');
    expect(screen.getByText('SECRETÁRIOS DA ESTACA')).toBeOnTheScreen();
    expect(screen.queryByText(/Ninguém encontrado/)).not.toBeOnTheScreen();
  });

  it('[leadership] CA-18: pressing a result opens the person sheet', async () => {
    const user = userEvent.setup();
    await setup();
    await screen.findByText('Presidente');
    await user.type(screen.getByPlaceholderText('Buscar nome ou chamado'), 'caetano');
    await user.press(screen.getByLabelText('Caetano Sumo, Sumo Conselheiro · Estaca'));
    expect(await screen.findByText('Acompanha: Içara')).toBeOnTheScreen();
  });

  it('[leadership] CA-20: the phones are fetched only when a sheet opens', async () => {
    const user = userEvent.setup();
    await setup();
    await user.press(await screen.findByLabelText('Antônio Presidente, Presidente da Estaca'));
    await waitFor(() =>
      expect(mockRpc.mock.calls.map(([name]) => name)).toContain('org_chart_phones'),
    );
    expect(mockRpc.mock.calls.filter(([name]) => name === 'org_chart_phones')).toHaveLength(1);
  });

  it('[leadership] RF-20: shows the skeleton while loading', async () => {
    mockRpc.mockImplementation(() => new Promise(() => {}));
    await render(
      <Providers client={client}>
        <LeadershipScreen />
      </Providers>,
    );
    expect(screen.getByTestId('tree-skeleton')).toBeOnTheScreen();
  });

  it('[leadership] CA-23: offline with cached data shows the tree and the offline banner', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(false);
    onlineManager.setOnline(false);
    seedCache(
      client,
      [
        makeCalled('stake_president', 'stake_presidency', {
          displayName: 'Do Cache',
          namePt: 'Presidente da Estaca',
        }),
      ],
      [],
    );
    await setup();
    expect(await screen.findByLabelText('Do Cache, Presidente da Estaca')).toBeOnTheScreen();
    expect(screen.getByText('Sem conexão. Mostrando a última versão salva.')).toBeOnTheScreen();
  });

  it('[leadership] CA-30: a first load that fails shows the error and retries', async () => {
    const user = userEvent.setup();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await render(
      <Providers client={client}>
        <LeadershipScreen />
      </Providers>,
    );
    expect(await screen.findByText('Não foi possível carregar a liderança.')).toBeOnTheScreen();
    mockRpc.mockImplementation(rpcFor({ members, links }));
    await user.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Presidente')).toBeOnTheScreen();
  });

  it('[leadership] CA-30: offline without cache shows the connection message', async () => {
    onlineManager.setOnline(false);
    await setup();
    expect(
      await screen.findByText('Sem conexão. Conecte-se para ver a liderança.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });

  describe('edit mode', () => {
    const roles = {
      estaca: [{ unitId: 'estaca', role: 'stake_leader' }],
      bispo: [{ unitId: 'criciuma1', role: 'unit_leader' }],
      publicador: [{ unitId: 'icara', role: 'unit_publisher' }],
      membro: [],
    };

    it.each([
      ['estaca', true],
      ['bispo', false],
      ['publicador', false],
      ['membro', false],
    ] as const)('[leadership] CA-26: %s sees Editar on the stake tree: %s', async (who, sees) => {
      mockMemberships = roles[who];
      await setup();
      await screen.findByText('Presidente');
      expect(!!screen.queryByRole('button', { name: 'Editar' })).toBe(sees);
    });

    it('[leadership] CA-26: Editar is not offered on the Unidades segment', async () => {
      const user = userEvent.setup();
      mockMemberships = roles.estaca;
      await setup();
      await screen.findByText('Presidente');
      await user.press(screen.getByText('Unidades'));
      expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeOnTheScreen();
    });

    it('[leadership] CA-26: offline, Editar is disabled with its own label', async () => {
      mockMemberships = roles.estaca;
      (useIsOnline as jest.Mock).mockReturnValue(false);
      seedCache(
        client,
        [makeCalled('stake_president', 'stake_presidency', { namePt: 'Presidente da Estaca' })],
        [],
      );
      onlineManager.setOnline(false);
      await setup();
      const button = await screen.findByRole('button', { name: 'Editar indisponível sem conexão' });
      expect(button).toBeDisabled();
    });

    it('[leadership] RF-23: Editar shows the banner and hides the search; Concluir reloads the links', async () => {
      const user = userEvent.setup();
      mockMemberships = roles.estaca;
      await setup();
      await user.press(await screen.findByRole('button', { name: 'Editar' }));
      expect(screen.getByText('Modo de edição')).toBeOnTheScreen();
      expect(screen.queryByPlaceholderText('Buscar nome ou chamado')).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Editar acompanhamento de Caetano Sumo')).toBeOnTheScreen();
      const before = mockRpc.mock.calls.filter(([name]) => name === 'org_chart_links').length;
      await user.press(screen.getByRole('button', { name: 'Concluir' }));
      expect(screen.queryByText('Modo de edição')).not.toBeOnTheScreen();
      expect(screen.getByPlaceholderText('Buscar nome ou chamado')).toBeOnTheScreen();
      await waitFor(() =>
        expect(mockRpc.mock.calls.filter(([name]) => name === 'org_chart_links')).toHaveLength(
          before + 1,
        ),
      );
    });

    it('[leadership] CA-27: saving a high councilor sends the links and reloads', async () => {
      const user = userEvent.setup();
      mockMemberships = roles.estaca;
      await setup();
      await user.press(await screen.findByRole('button', { name: 'Editar' }));
      await user.press(screen.getByLabelText('Editar acompanhamento de Caetano Sumo'));
      await user.press(screen.getByRole('button', { name: '2º Conselheiro' }));
      await user.press(screen.getByRole('button', { name: 'Araranguá' }));
      const before = mockRpc.mock.calls.filter(([name]) => name === 'org_chart_links').length;
      await user.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText('Acompanhamento salvo')).toBeOnTheScreen();
      expect(mockRpc).toHaveBeenCalledWith('set_high_councilor_links', {
        p_high_councilor_call_id: 'm2',
        p_counselor_calling_id: 'stake_second_counselor',
        p_unit_ids: ['icara', 'ararangua'],
      });
      await waitFor(() =>
        expect(mockRpc.mock.calls.filter(([name]) => name === 'org_chart_links')).toHaveLength(
          before + 1,
        ),
      );
    });
  });
});
