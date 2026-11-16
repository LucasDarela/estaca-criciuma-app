import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerDevice, requestPushPermission } from '@/lib/push';

import { EnablePushSheet } from './EnablePushSheet';

jest.mock('@/lib/push', () => ({ registerDevice: jest.fn(), requestPushPermission: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const onClose = jest.fn();

async function setup(visible = true) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <EnablePushSheet visible={visible} onClose={onClose} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

describe('EnablePushSheet', () => {
  it('RF-05: shows the title, the text and both buttons', async () => {
    await setup();
    expect(screen.getByText('Receber avisos?')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Avisamos sobre eventos e comunicados da estaca e da sua ala. Você escolhe o que receber em Notificações.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ativar avisos' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeOnTheScreen();
  });

  it('CA-05: "Ativar avisos" asks the system and, when granted, registers the token', async () => {
    (requestPushPermission as jest.Mock).mockResolvedValue('granted');
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Ativar avisos' }));
    await act(async () => undefined);
    expect(requestPushPermission).toHaveBeenCalledTimes(1);
    expect(registerDevice).toHaveBeenCalledWith({ force: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('CA-05: a refusal in the system dialog closes the sheet without registering', async () => {
    (requestPushPermission as jest.Mock).mockResolvedValue('denied');
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Ativar avisos' }));
    await act(async () => undefined);
    expect(registerDevice).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('"Agora não" closes without asking for permission', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Agora não' }));
    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
