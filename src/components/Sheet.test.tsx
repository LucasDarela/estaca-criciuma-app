import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmSheet } from './ConfirmSheet';
import { Sheet } from './Sheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withProvider(children: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

function renderConfirm(overrides: Partial<React.ComponentProps<typeof ConfirmSheet>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const element = withProvider(
    <ConfirmSheet
      visible
      title="Apagar anotação?"
      message="Esta ação não pode ser desfeita."
      confirmLabel="Apagar"
      cancelLabel="Manter"
      confirmVariant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { element, onConfirm, onCancel };
}

describe('Sheet and ConfirmSheet', () => {
  it('CA-13: pressing the backdrop cancels without confirming', async () => {
    const { element, onConfirm, onCancel } = renderConfirm();
    await render(element);
    await fireEvent.press(screen.getByLabelText('Fechar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('CA-13: pressing confirm calls onConfirm', async () => {
    const { element, onConfirm, onCancel } = renderConfirm();
    await render(element);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows the title as a header and the message', async () => {
    await render(renderConfirm().element);
    expect(screen.getByRole('header', { name: 'Apagar anotação?' })).toBeOnTheScreen();
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeOnTheScreen();
  });

  it('renders nothing while not visible', async () => {
    await render(renderConfirm({ visible: false }).element);
    expect(screen.queryByText('Apagar anotação?')).not.toBeOnTheScreen();
  });

  it('shows the content of a plain Sheet', async () => {
    await render(
      withProvider(
        <Sheet visible onClose={jest.fn()} accessibilityLabel="Filtros">
          <></>
        </Sheet>,
      ),
    );
    expect(screen.getByLabelText('Filtros')).toBeOnTheScreen();
  });
});
