import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { Membership } from '@/domain/permissions';

import { AccountError, grantRole } from './api';
import { GrantAccessSheet } from './GrantAccessSheet';

let mockMemberships: Membership[] = [];
jest.mock('./api', () => ({ ...jest.requireActual('./api'), grantRole: jest.fn() }));
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
  mockMemberships = [{ unitId: 'estaca', role: 'stake_leader', leadershipGroup: null }];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (grantRole as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

async function fillIcara(email = 'membro@exemplo.org') {
  await fireEvent.changeText(screen.getByLabelText('E-mail da conta'), email);
  await fireEvent.press(chip('Içara'));
  await fireEvent.press(chip('Liderança da unidade'));
  await fireEvent.press(chip('Bispos'));
}

describe('GrantAccessSheet', () => {
  it('CA-15: grants Liderança da unidade in Içara with group Bispos and shows the toast', async () => {
    await setup();
    expect(submit()).toBeDisabled();
    await fillIcara();
    expect(submit()).toBeEnabled();
    await fireEvent.press(submit());

    await waitFor(() =>
      expect(grantRole).toHaveBeenCalledWith({
        email: 'membro@exemplo.org',
        unitId: 'icara',
        role: 'unit_leader',
        leadershipGroup: 'bishops',
      }),
    );
    expect(await screen.findByText('Acesso concedido')).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it('CA-16: no_account shows the message on the e-mail field', async () => {
    (grantRole as jest.Mock).mockRejectedValue(new AccountError('no_account'));
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

  it('already_granted shows the message on the e-mail field', async () => {
    (grantRole as jest.Mock).mockRejectedValue(new AccountError('already_granted'));
    await setup();
    await fillIcara();
    await fireEvent.press(submit());
    expect(await screen.findByText('Esta pessoa já tem este acesso.')).toBeTruthy();
  });

  it('CA-25: no_home_unit shows the message on the e-mail field', async () => {
    (grantRole as jest.Mock).mockRejectedValue(new AccountError('no_home_unit'));
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
    (grantRole as jest.Mock).mockRejectedValue(new AccountError('wrong_unit'));
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
    expect(grantRole).not.toHaveBeenCalled();
  });

  it('CA-17: a stake leader has no Administração chip on the stake', async () => {
    await setup();
    await fireEvent.press(chip('Estaca'));
    expect(chip('Liderança da estaca')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Administração' })).toBeNull();
  });

  it('CA-17: an admin has the Administração chip on the stake', async () => {
    mockMemberships = [{ unitId: 'estaca', role: 'admin', leadershipGroup: null }];
    await setup();
    await fireEvent.press(chip('Estaca'));
    expect(chip('Administração')).toBeTruthy();
  });

  it('changing the unit clears the role and group that stopped being valid', async () => {
    await setup();
    await fillIcara();
    await fireEvent.press(chip('Estaca'));
    expect(submit()).toBeDisabled(); // role was cleared
    expect(screen.getByRole('button', { name: 'Presidência da estaca' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bispos' })).toBeNull();
  });
});
