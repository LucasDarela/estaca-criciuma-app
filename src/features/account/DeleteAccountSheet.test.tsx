import '@/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';

import { AccountError, deleteMyAccount } from './api';
import { DeleteAccountSheet } from './DeleteAccountSheet';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  deleteMyAccount: jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const onClose = jest.fn();

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        <DeleteAccountSheet visible onClose={onClose} />
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

const submit = () => screen.getByRole('button', { name: 'Excluir conta' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (deleteMyAccount as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('DeleteAccountSheet', () => {
  it('CA-13: lowercase excluir keeps the button disabled; EXCLUIR deletes, navigates and toasts', async () => {
    await setup();
    expect(screen.getByText(/Digite EXCLUIR para confirmar/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Confirmação'), 'excluir');
    expect(submit()).toBeDisabled();
    await fireEvent.press(submit());
    expect(deleteMyAccount).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Confirmação'), 'EXCLUIR');
    expect(submit()).toBeEnabled();
    await fireEvent.press(submit());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/agenda'));
    expect(deleteMyAccount).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Conta excluída.')).toBeTruthy();
  });

  it('CA-20: last_admin shows the transfer message and does not navigate', async () => {
    (deleteMyAccount as jest.Mock).mockRejectedValue(new AccountError('last_admin'));
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Confirmação'), 'EXCLUIR');
    await fireEvent.press(submit());
    expect(
      await screen.findByText(
        'Transfira a administração para outra pessoa antes de excluir sua conta.',
      ),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('a network failure shows the toast and deletes nothing', async () => {
    (deleteMyAccount as jest.Mock).mockRejectedValue(new AccountError('network'));
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Confirmação'), 'EXCLUIR');
    await fireEvent.press(submit());
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
