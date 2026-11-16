import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';

import { OtpScreen } from './OtpScreen';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { email: string; returnTo?: string } = { email: 'ana@exemplo.org' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ track: jest.fn() }));

const verifyOtp = jest.fn();
const signInWithOtp = jest.fn();
let consentedAt: string | null = '2026-11-15T00:00:00Z';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockParams = { email: 'ana@exemplo.org' };
  consentedAt = '2026-11-15T00:00:00Z';
  verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  signInWithOtp.mockResolvedValue({ error: null });
  (getSupabase as jest.Mock).mockReturnValue({
    auth: { verifyOtp, signInWithOtp },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { consented_at: consentedAt }, error: null }),
        }),
      }),
    }),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// The countdown re-arms a timer after each render, so advance one second at a time.
async function waitSeconds(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

async function enterCode(code = '123456') {
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), code);
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}

describe('OtpScreen', () => {
  it('CA-04: shows the e-mail in the sentence and the 60 s countdown, then Reenviar código', async () => {
    await render(<OtpScreen />);
    expect(screen.getByText('Enviamos um código de 6 dígitos para ana@exemplo.org.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reenviar em 60 s' })).toBeTruthy();

    await waitSeconds(60);
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeTruthy();
    expect(screen.queryByText(/Reenviar em/)).toBeNull();
  });

  it('resending requests a new code and restarts the countdown', async () => {
    await render(<OtpScreen />);
    await waitSeconds(60);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar código' }));
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reenviar em 60 s' })).toBeTruthy();
  });

  it('CA-28: a 401 when resending shows the send message, not the invalid code one', async () => {
    signInWithOtp.mockResolvedValue({ error: new AuthApiError('server message', 401, undefined) });
    await render(<OtpScreen />);
    await waitSeconds(60);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar código' }));
    expect(
      await screen.findByText('Não foi possível enviar o código. Tente de novo.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Código inválido ou expirado/)).toBeNull();
  });

  it('CA-05: a wrong code shows the invalid code message', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('x', 403, 'otp_expired'),
    });
    await render(<OtpScreen />);
    await enterCode('000000');
    expect(
      await screen.findByText('Código inválido ou expirado. Confira ou peça um novo.'),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('CA-06: a 429 shows the too many attempts message', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('x', 429, undefined),
    });
    await render(<OtpScreen />);
    await enterCode();
    expect(
      await screen.findByText('Muitas tentativas. Aguarde alguns minutos e tente de novo.'),
    ).toBeTruthy();
  });

  it('a network failure shows the no connection message', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('x', 0),
    });
    await render(<OtpScreen />);
    await enterCode();
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeTruthy();
  });

  it('consented: false goes to /welcome', async () => {
    consentedAt = null;
    await render(<OtpScreen />);
    await enterCode();
    await act(async () => {});
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });

  it('consented: true goes to /agenda, or to returnTo', async () => {
    await render(<OtpScreen />);
    await enterCode();
    await act(async () => {});
    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });

  it('consented: true goes back to returnTo when given', async () => {
    mockParams = { email: 'ana@exemplo.org', returnTo: '/notes' };
    await render(<OtpScreen />);
    await enterCode();
    await act(async () => {});
    expect(mockReplace).toHaveBeenCalledWith('/notes');
  });

  it('pasting 123456 fills the six boxes and keeps only digits', async () => {
    await render(<OtpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '12a3 4567');
    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      expect(screen.getByText(digit)).toBeTruthy();
    }
    expect(screen.queryByText('7')).toBeNull();
  });

  it('Usar outro e-mail goes back', async () => {
    await render(<OtpScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Usar outro e-mail' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('CA-21: requesting and verifying the code never logs the e-mail or the code', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    await render(<OtpScreen />);
    await waitSeconds(60);
    await fireEvent.press(screen.getByRole('button', { name: 'Reenviar código' }));
    await enterCode('654321');
    await act(async () => {});

    const logged = JSON.stringify([
      ...spies.flatMap((spy) => spy.mock.calls),
      ...(track as jest.Mock).mock.calls,
    ]);
    expect(logged).not.toContain('ana@exemplo.org');
    expect(logged).not.toContain('654321');
    expect(track).toHaveBeenCalledWith('user_signed_in', { method: 'email_otp' });
    spies.forEach((spy) => spy.mockRestore());
  });
});
