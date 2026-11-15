import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';

import { SearchField } from './SearchField';

describe('SearchField', () => {
  it('CA-04: the clear button empties the text', async () => {
    const user = userEvent.setup();
    const onChangeText = jest.fn();
    await render(<SearchField value="reunião" onChangeText={onChangeText} placeholder="Buscar" />);
    await user.press(screen.getByRole('button', { name: 'Limpar' }));
    expect(onChangeText).toHaveBeenCalledWith('');
  });

  it('CA-04: hides the clear button when there is no text', async () => {
    await render(<SearchField value="" onChangeText={jest.fn()} placeholder="Buscar" />);
    expect(screen.queryByRole('button', { name: 'Limpar' })).not.toBeOnTheScreen();
    expect(screen.getByRole('search')).toBeOnTheScreen();
  });
});
