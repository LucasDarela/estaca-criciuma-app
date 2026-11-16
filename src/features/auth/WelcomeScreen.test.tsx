import i18n from '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import { signOut } from '@/lib/authSession';

import { completeWelcome } from './api';
import { WelcomeScreen } from './WelcomeScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('./api', () => ({ completeWelcome: jest.fn() }));
jest.mock('@/lib/authSession', () => ({ signOut: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const CONSENT_START = 'Autorizo a Estaca Criciúma a tratar meu nome';

async function renderScreen() {
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WelcomeScreen />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (completeWelcome as jest.Mock).mockResolvedValue(undefined);
  (signOut as jest.Mock).mockResolvedValue(undefined);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await i18n.changeLanguage('pt-BR');
});

describe('WelcomeScreen', () => {
  it('CA-27: choosing Español (México) switches the texts and saves es-MX', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Idioma/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Español (México)' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Comenzar' })).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('¿Cómo podemos llamarte?'), 'Ana');
    await fireEvent.press(screen.getByRole('checkbox', { name: /Autorizo a la Estaca Criciúma/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Comenzar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/agenda'));
    expect(completeWelcome).toHaveBeenCalledWith({
      displayName: 'Ana',
      homeUnitId: null,
      locale: 'es-MX',
    });
  });

  it('CA-09: Começar without consent shows the RF-09 message and saves nothing', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Como podemos chamar você?'), 'Ana Souza');
    await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));
    expect(
      screen.getByText('Para usar sua conta, é preciso concordar com o tratamento dos dados.'),
    ).toBeTruthy();
    expect(completeWelcome).not.toHaveBeenCalled();
  });

  it('CA-09: with consent it saves name, unit and locale and goes to /agenda', async () => {
    const { invalidate } = await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Como podemos chamar você?'), '  Ana Souza ');
    await fireEvent.press(screen.getByRole('button', { name: /Unidade que você frequenta/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Içara' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_START) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/agenda'));
    expect(completeWelcome).toHaveBeenCalledWith({
      displayName: 'Ana Souza',
      homeUnitId: 'icara',
      locale: 'pt-BR',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['viewer'] });
  });

  it('keeps the default unit as none (null)', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Como podemos chamar você?'), 'Ana');
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_START) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));
    await waitFor(() => expect(completeWelcome).toHaveBeenCalled());
    expect((completeWelcome as jest.Mock).mock.calls[0][0].homeUnitId).toBeNull();
  });

  it('an empty name and a 1-character name show their messages', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_START) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));
    expect(screen.getByText('Informe como podemos chamar você.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Como podemos chamar você?'), 'A');
    await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));
    expect(screen.getByText('Use entre 2 e 60 caracteres.')).toBeTruthy();
    expect(completeWelcome).not.toHaveBeenCalled();
  });

  it('RNF-10: the consent is a checkbox labeled with the full text and shows its state', async () => {
    await renderScreen();
    const box = screen.getByRole('checkbox', { name: new RegExp(CONSENT_START) });
    expect(box.props.accessibilityLabel).toContain('Posso exportar ou excluir meus dados');
    await fireEvent.press(box);
    expect(screen.getByRole('checkbox', { checked: true })).toBeTruthy();
  });

  it('CA-10: leaving without finishing signs out and goes to /agenda', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/agenda'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows a generic toast when saving fails and stays on the screen', async () => {
    (completeWelcome as jest.Mock).mockRejectedValue(new Error('x'));
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Como podemos chamar você?'), 'Ana');
    await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(CONSENT_START) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Começar' }));
    expect(await screen.findByText('Algo deu errado. Tente de novo.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
