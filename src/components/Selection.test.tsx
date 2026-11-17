import { render, screen, userEvent } from '@testing-library/react-native';

import { Checkbox } from './Checkbox';
import { ChipGroup } from './ChipGroup';
import { FilterChip } from './FilterChip';
import { Segmented } from './Segmented';
import { Switch } from './Switch';

const options = [
  { value: 'month', label: 'Mês' },
  { value: 'week', label: 'Semana', count: 3 },
  { value: 'day', label: 'Dia' },
] as const;

describe('selection controls', () => {
  it('CA-05: FilterChip reports selection state and calls onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<FilterChip label="Içara" selected={false} onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Içara' });
    expect(chip).not.toBeSelected();
    await user.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(<FilterChip label="Içara" selected onPress={onPress} />);
    expect(screen.getByRole('button', { name: 'Içara' })).toBeSelected();
  });

  it('CA-05: Segmented calls onChange with the value of the pressed option', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<Segmented options={options} value="month" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Mês' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Dia' })).not.toBeSelected();
    await user.press(screen.getByRole('tab', { name: 'Dia' }));
    expect(onChange).toHaveBeenCalledWith('day');
  });

  it('CA-05: Segmented exposes the count in the accessible label', async () => {
    await render(<Segmented options={options} value="month" onChange={jest.fn()} />);
    expect(screen.getByRole('tab', { name: 'Semana, 3' })).toBeOnTheScreen();
  });

  it('CA-10: Switch has the switch role and toggles with the opposite value', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    await render(<Switch label="Lembretes" value={false} onValueChange={onValueChange} />);
    const control = screen.getByRole('switch', { name: 'Lembretes' });
    expect(control).not.toBeChecked();
    await user.press(control);
    expect(onValueChange).toHaveBeenCalledWith(true);

    await screen.rerender(<Switch label="Lembretes" value onValueChange={onValueChange} />);
    expect(screen.getByRole('switch', { name: 'Lembretes' })).toBeChecked();
    await user.press(screen.getByRole('switch', { name: 'Lembretes' }));
    expect(onValueChange).toHaveBeenLastCalledWith(false);
  });

  it('CA-10: a disabled Switch ignores presses', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    await render(<Switch label="Lembretes" value={false} onValueChange={onValueChange} disabled />);
    await user.press(screen.getByRole('switch', { name: 'Lembretes' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('RNF-07: FilterChip with role radio exposes checked instead of selected', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <ChipGroup label="Unidade" role="radiogroup">
        <FilterChip role="radio" label="Içara" selected onPress={onPress} />
        <FilterChip role="radio" label="Criciúma 1" selected={false} onPress={onPress} />
      </ChipGroup>,
    );
    expect(screen.getByLabelText('Unidade', { exact: true, hidden: false })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Içara' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Criciúma 1' })).not.toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Criciúma 1' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('RNF-06: Checkbox has the checkbox role, the hint, and toggles to the opposite value', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(
      <Checkbox label="Notificar" hint="Envia push" checked={false} onChange={onChange} />,
    );
    const box = screen.getByRole('checkbox', { name: 'Notificar' });
    expect(box).not.toBeChecked();
    expect(box.props.accessibilityHint).toBe('Envia push');
    await user.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    await screen.rerender(<Checkbox label="Notificar" checked onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: 'Notificar' })).toBeChecked();
  });

  it('RNF-06: a disabled Checkbox does not call onChange', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<Checkbox label="Notificar" checked={false} disabled onChange={onChange} />);
    await user.press(screen.getByRole('checkbox', { name: 'Notificar' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
