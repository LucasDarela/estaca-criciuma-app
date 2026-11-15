import '@/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { requestCode } from './api';
import { SignInScreen } from './SignInScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ returnTo: '/notes' }),
}));
jest.mock('./api', () => ({ ...jest.requireActual('./api'), requestCode: jest.fn() }));

const requestCodeMock = requestCode as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  requestCodeMock.mockResolvedValue(undefined);
});

describe('SignInScreen', () => {
  it('CA-03: an empty field and then abc@ show the field errors', async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Receber código' }));
    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'abc@');
    await fireEvent.press(screen.getByRole('button', { name: 'Receber código' }));
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(requestCodeMock).not.toHaveBeenCalled();
  });

  it('CA-04: a valid e-mail requests the code once, even on a double tap, and navigates', async () => {
    let release!: () => void;
    requestCodeMock.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), ' Ana@Exemplo.org ');
    const button = screen.getByRole('button', { name: 'Receber código' });
    await fireEvent.press(button);
    await fireEvent.press(button); // the first request is still pending
    release();

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(requestCodeMock).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in/code',
      params: { email: 'ana@exemplo.org', returnTo: '/notes' },
    });
  });

  it('shows a request error on the field and does not navigate', async () => {
    const { AuthFlowError } = jest.requireActual('./api');
    requestCodeMock.mockRejectedValue(new AuthFlowError('network'));
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@exemplo.org');
    await fireEvent.press(screen.getByRole('button', { name: 'Receber código' }));
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('CA-07: only the e-mail field and Receber código, with no Google or Apple', async () => {
    await render(<SignInScreen />);
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/google/i)).toBeNull();
    expect(screen.queryByText(/apple/i)).toBeNull();
  });
});
