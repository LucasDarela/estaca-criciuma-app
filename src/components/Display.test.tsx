import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';

import { Avatar } from './Avatar';
import { EmptyState } from './EmptyState';
import { EventCard } from './EventCard';
import { ListItem } from './ListItem';
import { OfflineBanner } from './OfflineBanner';

describe('display components', () => {
  it('CA-08: EventCard calls onPress and its label has time, title, place and unit', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <EventCard
        title="Conferência de estaca"
        timeLabel="09:00"
        unitId="estaca"
        place="Capela Central"
        onPress={onPress}
      />,
    );
    const card = screen.getByRole('button', {
      name: '09:00, Conferência de estaca, Capela Central, Estaca',
    });
    await user.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('CA-08: ListItem with chevron calls onPress and labels title and subtitle', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <ListItem
        title="Ala Içara"
        subtitle="Bispado"
        trailing={{ kind: 'chevron' }}
        onPress={onPress}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Ala Içara, Bispado' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('CA-08: ListItem without subtitle is labeled by its title only', async () => {
    await render(<ListItem title="Sair" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeOnTheScreen();
  });

  it('CA-08: ListItem switch trailing toggles with the opposite value', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    await render(
      <ListItem
        title="Lembretes"
        trailing={{ kind: 'switch', value: false, onValueChange, label: 'Lembretes' }}
      />,
    );
    await user.press(screen.getByRole('switch', { name: 'Lembretes' }));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it.each([
    ['Maria da Silva', 'MS'],
    ['Ângela', 'Â'],
    [' joão  pedro ', 'JP'],
  ])('CA-09: Avatar for %j shows %s', async (name, expected) => {
    await render(<Avatar name={name} />);
    // Hidden from the accessibility tree on purpose, so include hidden elements.
    expect(screen.getByText(expected, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('CA-14: OfflineBanner shows the offline message as an alert', async () => {
    await render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText('Sem conexão. Mostrando a última versão salva.')).toBeOnTheScreen();
  });

  it('EmptyState shows the message and runs its action', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<EmptyState message="Nada por aqui." action={{ label: 'Atualizar', onPress }} />);
    expect(screen.getByText('Nada por aqui.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Atualizar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
