import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/toast/ToastProvider';

import { AccountError, setMyPhone, type MyPhone } from './api';
import { PhoneSheet } from './PhoneSheet';

jest.mock('./api', () => ({ ...jest.requireActual('./api'), setMyPhone: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function setup(current: MyPhone | null = null) {
  const onClose = jest.fn();
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PhoneSheet visible current={current} userId="u1" onClose={onClose} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { onClose, invalidate };
}

const field = () => screen.getByPlaceholderText('(48) 99999-0000');

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (setMyPhone as jest.Mock).mockResolvedValue(undefined);
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => jest.restoreAllMocks());

describe('PhoneSheet', () => {
  it('[leadership] RF-21: masks the digits while typing, up to 11 digits', async () => {
    await setup();
    await fireEvent.changeText(field(), '4899');
    expect(field().props.value).toBe('(48) 99');
    await fireEvent.changeText(field(), '48999990000999');
    expect(field().props.value).toBe('(48) 99999-0000');
    expect(field().props.keyboardType).toBe('phone-pad');
  });

  it('[leadership] RF-21: starts from the saved phone', async () => {
    await setup({ phoneE164: '+554833330000', showOnOrgChart: true });
    expect(field().props.value).toBe('(48) 3333-0000');
    expect(
      screen.getByRole('switch', { name: 'Mostrar meu telefone no organograma' }).props
        .accessibilityState.checked,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Remover telefone' })).toBeTruthy();
  });

  it('[leadership] RNF-13: the switch is announced with its label and the help text shows', async () => {
    await setup();
    expect(
      screen.getByRole('switch', { name: 'Mostrar meu telefone no organograma' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Só pessoas com conta veem, e só nos chamados em que você aparece no organograma.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remover telefone' })).toBeNull();
  });

  it('[leadership] CA-24: saving sends the E.164 number and the switch, toasts and invalidates', async () => {
    const { onClose, invalidate } = await setup();
    await fireEvent.changeText(field(), '48999990000');
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Mostrar meu telefone no organograma' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(setMyPhone).toHaveBeenCalledWith('+5548999990000', true));
    expect(await screen.findByText('Telefone salvo')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['myPhone', 'u1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leadership', 'phones'] });
  });

  it('[leadership] CA-25: an incomplete number shows the area code message', async () => {
    await setup();
    await fireEvent.changeText(field(), '4899999');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Informe um telefone com DDD.')).toBeTruthy();
    expect(setMyPhone).not.toHaveBeenCalled();
  });

  it('[leadership] CA-25: an area code starting with 0 is invalid', async () => {
    await setup();
    await fireEvent.changeText(field(), '04999990000');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Informe um telefone com DDD.')).toBeTruthy();
  });

  it('[leadership] CA-25: an empty field with the switch on asks for the phone', async () => {
    await setup();
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Mostrar meu telefone no organograma' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('Informe o telefone para mostrá-lo no organograma.')).toBeTruthy();
    expect(setMyPhone).not.toHaveBeenCalled();
  });

  it('[leadership] CA-25: Remover telefone removes it and toasts', async () => {
    const { onClose } = await setup({ phoneE164: '+5548999990000', showOnOrgChart: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Remover telefone' }));
    await waitFor(() => expect(setMyPhone).toHaveBeenCalledWith(null, false));
    expect(await screen.findByText('Telefone removido')).toBeTruthy();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('[leadership] an empty field with the switch off and a saved phone removes it', async () => {
    await setup({ phoneE164: '+5548999990000', showOnOrgChart: false });
    await fireEvent.changeText(field(), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(setMyPhone).toHaveBeenCalledWith(null, false));
  });

  it('[leadership] RF-22: a network failure keeps the sheet open with what was typed', async () => {
    (setMyPhone as jest.Mock).mockRejectedValue(new AccountError('network'));
    const { onClose } = await setup();
    await fireEvent.changeText(field(), '48999990000');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(field().props.value).toBe('(48) 99999-0000');
  });

  it('[leadership] RF-22: a second press while saving does not send twice', async () => {
    (setMyPhone as jest.Mock).mockReturnValue(new Promise(() => {}));
    await setup();
    await fireEvent.changeText(field(), '48999990000');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(setMyPhone).toHaveBeenCalledTimes(1);
  });
});
