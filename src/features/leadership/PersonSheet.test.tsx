import '@/i18n';

import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { AccessibilityInfo, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { OrgChartLink, OrgChartMember } from '@/domain/orgChart';
import { makeCalled } from '@/domain/orgChartFixtures';

import { PersonSheet } from './PersonSheet';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/leadership',
}));
let mockSession: { status: string; userId?: string } = { status: 'signedIn', userId: 'u1' };
jest.mock('@/lib/authSession', () => ({ useAuthSession: () => mockSession }));
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));
const fetchOrgChartPhones = mockRpc;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const sumo = makeCalled('high_councilor', 'high_council', {
  displayName: 'Ana Sumo',
  namePt: 'Sumo Conselheiro',
});
const landline = makeCalled('high_councilor', 'high_council', {
  displayName: 'Beto Fixo',
  namePt: 'Sumo Conselheiro',
});
const hidden = makeCalled('high_councilor', 'high_council', {
  displayName: 'Caio Oculto',
  namePt: 'Sumo Conselheiro',
});
const counselor = makeCalled('bishopric_first_counselor', 'bishopric', {
  unitId: 'criciuma1',
  displayName: 'Davi Conselheiro',
  namePt: 'Primeiro Conselheiro',
});
const links: OrgChartLink[] = [
  { kind: 'high_council_unit', memberCallId: sumo.memberCallId, targetUnitId: 'icara' },
  { kind: 'high_council_unit', memberCallId: sumo.memberCallId, targetUnitId: 'criciuma1' },
  {
    kind: 'unit_org_counselor',
    unitId: 'criciuma1',
    organization: 'primary',
    counselorCallingId: 'bishopric_first_counselor',
  },
  {
    kind: 'unit_org_counselor',
    unitId: 'criciuma1',
    organization: 'young_women',
    counselorCallingId: 'bishopric_first_counselor',
  },
];

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function ui(person: OrgChartMember | null) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PersonSheet person={person} links={links} onClose={jest.fn()} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  client.clear();
  onlineManager.setOnline(true);
  mockSession = { status: 'signedIn', userId: 'u1' };
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  mockRpc.mockResolvedValue({
    data: [
      { member_call_id: sumo.memberCallId, phone_e164: '+5548999990000' },
      { member_call_id: landline.memberCallId, phone_e164: '+554833330000' },
    ],
    error: null,
  });
});

afterEach(() => jest.restoreAllMocks());

describe('PersonSheet', () => {
  it('[leadership] CA-19: a visitor sees the person and is asked to sign in', async () => {
    const user = userEvent.setup();
    mockSession = { status: 'signedOut' };
    await render(ui(sumo));
    expect(screen.getByText('Ana Sumo')).toBeOnTheScreen();
    expect(screen.getByText('Sumo Conselheiro · Estaca')).toBeOnTheScreen();
    expect(screen.getByText('Acompanha: Criciúma 1, Içara')).toBeOnTheScreen();
    expect(screen.getByText('Entre para ver os contatos.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { returnTo: '/leadership' },
    });
    expect(fetchOrgChartPhones).not.toHaveBeenCalled();
  });

  it('[leadership] CA-19: a person with no phone shows the same visitor text', async () => {
    mockSession = { status: 'signedOut' };
    await render(ui(hidden));
    expect(screen.getByText('Entre para ver os contatos.')).toBeOnTheScreen();
  });

  it('[leadership] CA-20: a signed-in member can call and open WhatsApp', async () => {
    const user = userEvent.setup();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(ui(sumo));
    expect(await screen.findByText('(48) 99999-0000')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ligar para Ana Sumo' }));
    expect(open).toHaveBeenCalledWith('tel:+5548999990000');
    await user.press(screen.getByRole('button', { name: 'Chamar Ana Sumo no WhatsApp' }));
    expect(open).toHaveBeenCalledWith('https://wa.me/5548999990000');
  });

  it('[leadership] CA-20: opening a second sheet does not fetch the phones again', async () => {
    const view = await render(ui(sumo));
    await screen.findByText('(48) 99999-0000');
    await view.rerender(ui(null));
    await view.rerender(ui(landline));
    expect(await screen.findByText('(48) 3333-0000')).toBeOnTheScreen();
    expect(fetchOrgChartPhones).toHaveBeenCalledTimes(1);
  });

  it('[leadership] CA-21: Copiar and a long press copy the number and show the toast', async () => {
    const user = userEvent.setup();
    await render(ui(sumo));
    await screen.findByText('(48) 99999-0000');
    await user.press(screen.getByRole('button', { name: 'Copiar telefone de Ana Sumo' }));
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('(48) 99999-0000');
    expect(await screen.findByText('Telefone copiado')).toBeOnTheScreen();
    (Clipboard.setStringAsync as jest.Mock).mockClear();
    await fireEvent(screen.getByText('(48) 99999-0000'), 'longPress');
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('(48) 99999-0000'));
  });

  it('[leadership] RNF-12: the number is announced digit by digit', async () => {
    await render(ui(sumo));
    expect(await screen.findByLabelText('4 8, 9 9 9 9 9, 0 0 0 0')).toBeOnTheScreen();
  });

  it('[leadership] CA-22: a landline has Ligar and Copiar, without WhatsApp', async () => {
    await render(ui(landline));
    await screen.findByText('(48) 3333-0000');
    expect(screen.getByRole('button', { name: 'Ligar para Beto Fixo' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Copiar telefone de Beto Fixo' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /WhatsApp/ })).not.toBeOnTheScreen();
  });

  it('[leadership] CA-22: a person without a visible phone has no contact area', async () => {
    await render(ui(hidden));
    await waitFor(() => expect(fetchOrgChartPhones).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Ligar/ })).not.toBeOnTheScreen(),
    );
    expect(screen.queryByText('Entre para ver os contatos.')).not.toBeOnTheScreen();
    expect(screen.queryByText('Telefone disponível com conexão.')).not.toBeOnTheScreen();
  });

  it('[leadership] CA-23: offline without phones loaded says it needs a connection', async () => {
    onlineManager.setOnline(false);
    await render(ui(sumo));
    expect(await screen.findByText('Telefone disponível com conexão.')).toBeOnTheScreen();
    expect(fetchOrgChartPhones).not.toHaveBeenCalled();
  });

  it('[leadership] a load error shows the message and retries', async () => {
    const user = userEvent.setup();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await render(ui(sumo));
    expect(await screen.findByText('Não foi possível carregar o telefone.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('(48) 99999-0000')).toBeOnTheScreen();
  });

  it('[leadership] RF-18: a unit counselor supervises organizations, in the RF-10 order', async () => {
    mockSession = { status: 'signedOut' };
    await render(ui(counselor));
    expect(screen.getByText('Primeiro Conselheiro · Criciúma 1')).toBeOnTheScreen();
    expect(screen.getByText('Acompanha: Moças, Primária')).toBeOnTheScreen();
  });

  it('[leadership] a person without supervision has no Acompanha line', async () => {
    mockSession = { status: 'signedOut' };
    await render(ui(hidden));
    expect(screen.queryByText(/^Acompanha:/)).not.toBeOnTheScreen();
  });
});
