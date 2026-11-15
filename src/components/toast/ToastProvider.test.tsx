import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useToast, useToastBottomOffset, ToastProvider, type ToastOptions } from './ToastProvider';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const captured: { show: (options: ToastOptions) => void } = { show: () => undefined };
const show = (options: ToastOptions) => captured.show(options);

function Capture({ offset }: { offset?: number }) {
  const toast = useToast();
  useEffect(() => {
    captured.show = toast.show;
  }, [toast]);
  return offset === undefined ? null : <Offset offset={offset} />;
}

function Offset({ offset }: { offset: number }) {
  useToastBottomOffset(offset);
  return null;
}

async function setup(offset?: number) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        <Capture offset={offset} />
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ToastProvider', () => {
  it('CA-11: a second show replaces the first and only the second is on screen', async () => {
    await setup();
    await act(async () => {
      show({ message: 'Primeira' });
      show({ message: 'Segunda' });
    });
    expect(screen.queryByText('Primeira')).not.toBeOnTheScreen();
    expect(screen.getByText('Segunda')).toBeOnTheScreen();
  });

  it('CA-11: the toast disappears after 4000 ms', async () => {
    await setup();
    await act(async () => show({ message: 'Anotação salva' }));
    await act(async () => jest.advanceTimersByTime(3999));
    expect(screen.getByText('Anotação salva')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Anotação salva')).not.toBeOnTheScreen();
  });

  it('CA-11: a toast with action stays until 6000 ms', async () => {
    await setup();
    await act(async () => show({ message: 'Anotação salva', actionLabel: 'Desfazer' }));
    await act(async () => jest.advanceTimersByTime(5999));
    expect(screen.getByText('Anotação salva')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Anotação salva')).not.toBeOnTheScreen();
  });

  it('CA-11: a replacing toast restarts the timer', async () => {
    await setup();
    await act(async () => show({ message: 'Primeira' }));
    await act(async () => jest.advanceTimersByTime(3000));
    await act(async () => show({ message: 'Segunda' }));
    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.getByText('Segunda')).toBeOnTheScreen();
  });

  it('runs the action and dismisses the toast', async () => {
    const onAction = jest.fn();
    await setup();
    await act(async () => show({ message: 'Anotação salva', actionLabel: 'Desfazer', onAction }));
    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Anotação salva')).not.toBeOnTheScreen();
  });

  it('sits space.lg above the safe area, or above a registered offset', async () => {
    await setup();
    await act(async () => show({ message: 'Oi' }));
    const overlay = () => screen.getByText('Oi').parent?.parent;
    expect(overlay()).toHaveStyle({ bottom: 34 + 16 });
  });

  it('uses the registered bottom offset instead of the safe area', async () => {
    await setup(84);
    await act(async () => show({ message: 'Oi' }));
    expect(screen.getByText('Oi').parent?.parent).toHaveStyle({ bottom: 84 + 16 });
  });
});
