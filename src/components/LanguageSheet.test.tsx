import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LanguageSheet } from './LanguageSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

describe('LanguageSheet', () => {
  it('marks the current option and calls onSelect', async () => {
    const onSelect = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <LanguageSheet
          visible
          title="Idioma"
          options={[
            { value: 'pt-BR', label: 'Português (Brasil)' },
            { value: 'en-US', label: 'English (US)' },
          ]}
          value="en-US"
          onSelect={onSelect}
          onClose={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('button', { name: 'English (US)', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Português (Brasil)' }));
    expect(onSelect).toHaveBeenCalledWith('pt-BR');
  });
});
