import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from './Button';

// userEvent.press fires real responder events; fireEvent.press would find the `onPress` prop
// of the Button wrapper itself and bypass the loading guard.
describe('Button', () => {
  it('CA-01: loading ignores presses and reports busy', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Salvar" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Salvar' });
    await user.press(button);
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
    expect(screen.getByText('Salvar')).toBeOnTheScreen();
  });

  it('CA-02: disabled ignores presses and reports disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Salvar" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Salvar' });
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('calls onPress when enabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button label="Salvar" onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses accessibilityLabel instead of the label when given', async () => {
    await render(<Button label="OK" accessibilityLabel="Confirmar envio" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirmar envio' })).toBeOnTheScreen();
  });

  it('allows a long label to wrap in at most 2 lines', async () => {
    await render(<Button label="Um rótulo bem longo" onPress={jest.fn()} />);
    expect(screen.getByText('Um rótulo bem longo').props.numberOfLines).toBe(2);
  });
});
