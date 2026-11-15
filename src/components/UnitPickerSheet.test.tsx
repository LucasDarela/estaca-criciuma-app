import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UnitPickerSheet } from './UnitPickerSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

function setup(value: 'icara' | null) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const view = (
    <SafeAreaProvider initialMetrics={metrics}>
      <UnitPickerSheet
        visible
        title="Unidade"
        noneLabel="Prefiro não informar"
        value={value}
        units={['criciuma1', 'icara']}
        onSelect={onSelect}
        onClose={onClose}
      />
    </SafeAreaProvider>
  );
  return { view, onSelect, onClose };
}

describe('UnitPickerSheet', () => {
  it('lists the none option first, then the units', async () => {
    const { view } = setup(null);
    await render(view);
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.indexOf('Prefiro não informar')).toBeLessThan(labels.indexOf('Criciúma 1'));
    expect(labels).toContain('Içara');
  });

  it('marks the selected unit and selects another', async () => {
    const { view, onSelect } = setup('icara');
    await render(view);
    expect(screen.getByRole('button', { name: 'Içara', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Criciúma 1' }));
    expect(onSelect).toHaveBeenCalledWith('criciuma1');
  });

  it('selects no unit with the none label', async () => {
    const { view, onSelect } = setup('icara');
    await render(view);
    await fireEvent.press(screen.getByRole('button', { name: 'Prefiro não informar' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
