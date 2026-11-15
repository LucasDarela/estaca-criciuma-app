import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { Membership } from '@/domain/permissions';

import { AccountError, fetchCallingCatalog, grantAdmin, grantCalling } from './api';
import { testCatalog } from './callingFixtures';
import { GrantAccessSheet } from './GrantAccessSheet';

let mockMemberships: Membership[] = [];
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  grantCalling: jest.fn(),
  grantAdmin: jest.fn(),
  fetchCallingCatalog: jest.fn(),
}));
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({ memberships: mockMemberships }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const onClose = jest.fn();

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <GrantAccessSheet visible onClose={onClose} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const chip = (name: string) => screen.getByRole('button', { name });
const submit = () => screen.getByRole('button', { name: 'Conceder' });

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberships = [{ unitId: 'estaca', role: 'stake_leader' }];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (grantCalling as jest.Mock).mockResolvedValue(undefined);
  (grantAdmin as jest.Mock).mockResolvedValue(undefined);
  (fetchCallingCatalog as jest.Mock).mockResolvedValue(testCatalog);
});
afterEach(() => jest.restoreAllMocks());

async function pickCalling(unit: string, calling: RegExp | string) {
  await fireEvent.press(chip(unit));
  await fireEvent.press(screen.getByRole('button', { name: /^Chamado/ }));
  await fireEvent.press(await screen.findByRole('button', { name: calling }));
}

async function fillIcara(email = 'membro@exemplo.org') {
  await fireEvent.changeText(screen.getByLabelText('E-mail da conta'), email);
  await pickCalling('Içara', /^Presidente da Primária/);
}

describe('GrantAccessSheet', () => {
  it('[roles] CA-09: grants Presidente da Primária in Içara and shows the toast', async () => {
    await setup();
    expect(submit()).toBeDisabled();
    await fillIcara();
    expect(submit()).toBeEnabled();
    await fireEvent.press(submit());

    await waitFor(() =>
      expect(grantCalling).toHaveBeenCalledWith({
        email: 'membro@exemplo.org',
        unitId: 'icara',
        callingId: 'primary_president',
      }),
    );
    expect(await screen.findByText('Chamado concedido')).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it('CA-16: no_account shows the message on the e-mail field', async () => {
    (grantCalling as jest.Mock).mockRejectedValue(new AccountError('no_account'));
    await setup();
    await fillIcara('ninguem@exemplo.org');
    await fireEvent.press(submit());
    expect(
      await screen.findByText(
        'Nenhuma conta com este e-mail. Peça para a pessoa entrar no app primeiro.',
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('[roles] already_granted shows the message on the e-mail field', async () => {
    (grantCalling as jest.Mock).mockRejectedValue(new AccountError('already_granted'));
    await setup();
    await fillIcara();
    await fireEvent.press(submit());
    expect(await screen.findByText('Esta pessoa já tem este chamado nesta unidade.')).toBeTruthy();
  });

  it('CA-25: no_home_unit shows the message on the e-mail field', async () => {
    (grantCalling as jest.Mock).mockRejectedValue(new AccountError('no_home_unit'));
    await setup();
    await fillIcara();
    await fireEvent.press(submit());
    expect(
      await screen.findByText(
        'Esta pessoa precisa informar a unidade no Perfil antes de receber um acesso.',
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('CA-24: wrong_unit shows the message on the e-mail field', async () => {
    (grantCalling as jest.Mock).mockRejectedValue(new AccountError('wrong_unit'));
    await setup();
    await fillIcara();
    await fireEvent.press(submit());
    expect(
      await screen.findByText(
        'Esta pessoa frequenta outra unidade. Papéis de unidade só podem ser dados na unidade dela.',
      ),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('an invalid e-mail is rejected before calling the API', async () => {
    await setup();
    await fillIcara('abc@');
    await fireEvent.press(submit());
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(grantCalling).not.toHaveBeenCalled();
  });

  it('[roles] CA-11: a stake leader has no Administração in the stake list', async () => {
    await setup();
    await fireEvent.press(chip('Estaca'));
    await fireEvent.press(screen.getByRole('button', { name: /^Chamado/ }));
    expect(await screen.findByRole('button', { name: /^Sumo Conselheiro/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Administração' })).toBeNull();
  });

  it('[roles] CA-11: an admin gets Administração first, and choosing it calls grantAdmin', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'admin' }];
    await setup();
    await fireEvent.changeText(screen.getByLabelText('E-mail da conta'), 'novo.admin@exemplo.org');
    await pickCalling('Estaca', 'Administração');
    await fireEvent.press(submit());
    await waitFor(() => expect(grantAdmin).toHaveBeenCalledWith('novo.admin@exemplo.org'));
    expect(grantCalling).not.toHaveBeenCalled();
  });

  it('changing the unit clears the chosen calling', async () => {
    await setup();
    await fillIcara();
    expect(submit()).toBeEnabled();
    await fireEvent.press(chip('Estaca'));
    expect(submit()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chamado, Selecione' })).toBeTruthy();
  });
});
