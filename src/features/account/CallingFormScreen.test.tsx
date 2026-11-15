import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { Membership } from '@/domain/permissions';

import { AccountError, callingHolderCount, fetchCallingCatalog, saveCalling } from './api';
import { testCatalog } from './callingFixtures';
import { CallingFormScreen } from './CallingFormScreen';

const mockBack = jest.fn();
let mockParams: { id: string } = { id: 'new' };
let mockMemberships: Membership[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  fetchCallingCatalog: jest.fn(),
  saveCalling: jest.fn(),
  callingHolderCount: jest.fn(),
}));
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
        <ToastProvider>
          <CallingFormScreen />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'new' };
  mockMemberships = [{ unitId: 'estaca', role: 'admin' }];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (fetchCallingCatalog as jest.Mock).mockResolvedValue(testCatalog);
  (saveCalling as jest.Mock).mockResolvedValue('saved-id');
  (callingHolderCount as jest.Mock).mockResolvedValue(0);
});
afterEach(() => jest.restoreAllMocks());

/** A chip inside one of the labeled groups (the same label can appear in more than one row). */
const group = (label: string) => screen.getByLabelText(label);
const chipIn = (label: string, name: string) => within(group(label)).getByRole('button', { name });
const save = () => screen.getByRole('button', { name: 'Salvar' });

describe('CallingFormScreen', () => {
  it('[roles] CA-20: a stake leader sees Acesso restrito on the route', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'stake_leader' }];
    await setup();
    expect(screen.getByText('Acesso restrito')).toBeTruthy();
    expect(fetchCallingCatalog).not.toHaveBeenCalled();
  });

  it('creates a calling, shows the toast and goes back to the list', async () => {
    await setup();
    await fireEvent.changeText(
      screen.getByLabelText('Nome (português)'),
      '  Coordenador de Caravanas ao Templo ',
    );
    await fireEvent.press(chipIn('Grupo de aviso', 'Consultores de Templo e História da Família'));
    await fireEvent.press(save());

    await waitFor(() =>
      expect(saveCalling).toHaveBeenCalledWith({
        id: null,
        namePt: 'Coordenador de Caravanas ao Templo',
        nameEn: null,
        nameEs: null,
        level: 'stake',
        access: 'none',
        notifyGroup: 'temple_family_history_workers',
        orgChartSection: null,
        active: true,
      }),
    );
    expect(await screen.findByText('Chamado salvo')).toBeTruthy();
    expect(mockBack).toHaveBeenCalled();
  });

  it('validates the Portuguese name before saving', async () => {
    await setup();
    await fireEvent.press(save());
    expect(screen.getByText('Informe o nome.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nome (português)'), 'A');
    await fireEvent.press(save());
    expect(screen.getByText('Use entre 2 e 80 caracteres.')).toBeTruthy();
    expect(saveCalling).not.toHaveBeenCalled();
  });

  it('name_taken shows the message on the name field', async () => {
    (saveCalling as jest.Mock).mockRejectedValue(new AccountError('name_taken'));
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Nome (português)'), 'Sumo Conselheiro');
    await fireEvent.press(save());
    expect(await screen.findByText('Já existe um chamado com este nome neste nível.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('opens an existing calling with its values and the stake access options', async () => {
    mockParams = { id: 'high_councilor' };
    await setup();
    expect(await screen.findByDisplayValue('Sumo Conselheiro')).toBeTruthy();
    const selected = (label: string, name: string) => chipIn(label, name).props.accessibilityState;
    expect(selected('Nível', 'Estaca')).toMatchObject({ selected: true });
    expect(selected('Acesso', 'Liderança da estaca')).toMatchObject({ selected: true });
    expect(selected('Grupo de aviso', 'Sumo conselho')).toMatchObject({ selected: true });
    expect(selected('Seção do organograma', 'Sumo conselho')).toMatchObject({ selected: true });
    expect(screen.queryByRole('button', { name: 'Liderança da unidade' })).toBeNull();
  });

  it('[roles] RNF-09: each row of chips is a labeled group', async () => {
    await setup();
    for (const label of ['Nível', 'Acesso', 'Grupo de aviso', 'Seção do organograma']) {
      expect(group(label).props.accessibilityRole).toBe('radiogroup');
    }
  });

  it('changing the level drops the access and section that stop being valid', async () => {
    mockParams = { id: 'high_councilor' };
    await setup();
    await screen.findByDisplayValue('Sumo Conselheiro');
    await fireEvent.press(chipIn('Nível', 'Ala'));
    expect(chipIn('Acesso', 'Nenhum').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'Liderança da unidade' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Liderança da estaca' })).toBeNull();
    await fireEvent.press(save());
    await waitFor(() =>
      expect(saveCalling).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'ward', access: 'none', orgChartSection: null }),
      ),
    );
  });

  it('[roles] CA-18: deactivating a calling that someone has shows the message with the count', async () => {
    mockParams = { id: 'primary_president' };
    (saveCalling as jest.Mock).mockRejectedValue(new AccountError('in_use'));
    (callingHolderCount as jest.Mock).mockResolvedValue(1);
    await setup();
    await screen.findByDisplayValue('Presidente da Primária');
    await fireEvent.press(screen.getByRole('switch', { name: 'Ativo' }));
    await fireEvent.press(save());
    expect(
      await screen.findByText('Remova este chamado das 1 pessoas que o têm antes de desativá-lo.'),
    ).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('level_locked shows its message', async () => {
    mockParams = { id: 'primary_president' };
    (saveCalling as jest.Mock).mockRejectedValue(new AccountError('level_locked'));
    await setup();
    await screen.findByDisplayValue('Presidente da Primária');
    await fireEvent.press(chipIn('Nível', 'Ramo'));
    await fireEvent.press(save());
    expect(
      await screen.findByText('Não dá para mudar o nível de um chamado que alguém tem.'),
    ).toBeTruthy();
  });

  it('[roles] CA-19: changing the access of a calling someone has asks first and saves only after', async () => {
    mockParams = { id: 'primary_president' };
    (callingHolderCount as jest.Mock).mockResolvedValue(1);
    await setup();
    await screen.findByDisplayValue('Presidente da Primária');
    await fireEvent.press(chipIn('Acesso', 'Liderança da unidade'));
    await fireEvent.press(save());

    expect(await screen.findByText('Mudar o acesso?')).toBeTruthy();
    expect(
      screen.getByText('1 pessoas com este chamado passam a ter "Liderança da unidade".'),
    ).toBeTruthy();
    expect(saveCalling).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Mudar' }));
    await waitFor(() =>
      expect(saveCalling).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'primary_president', access: 'unit_leader' }),
      ),
    );
    expect(await screen.findByText('Chamado salvo')).toBeTruthy();
  });

  it('cancelling the access confirmation saves nothing', async () => {
    mockParams = { id: 'primary_president' };
    (callingHolderCount as jest.Mock).mockResolvedValue(2);
    await setup();
    await screen.findByDisplayValue('Presidente da Primária');
    await fireEvent.press(chipIn('Acesso', 'Nenhum'));
    await fireEvent.press(save());
    await screen.findByText('Mudar o acesso?');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(saveCalling).not.toHaveBeenCalled();
  });

  it('changing the access of a calling nobody has saves without asking', async () => {
    mockParams = { id: 'primary_president' };
    (callingHolderCount as jest.Mock).mockResolvedValue(0);
    await setup();
    await screen.findByDisplayValue('Presidente da Primária');
    await fireEvent.press(chipIn('Acesso', 'Nenhum'));
    await fireEvent.press(save());
    await waitFor(() => expect(saveCalling).toHaveBeenCalled());
    expect(screen.queryByText('Mudar o acesso?')).toBeNull();
  });
});
