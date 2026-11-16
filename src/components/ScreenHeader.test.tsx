import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';

import { HeaderAvatarProvider } from './HeaderAvatarContext';
import { ScreenHeader } from './ScreenHeader';

describe('ScreenHeader', () => {
  it('CA-12: shows the initials and opens the profile when the avatar is pressed', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <HeaderAvatarProvider value={{ name: 'Maria Souza', onPress }}>
        <ScreenHeader title="Agenda" showAvatar />
      </HeaderAvatarProvider>,
    );
    expect(screen.getByText('MS', { includeHiddenElements: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Abrir perfil' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('CA-12: shows no avatar without a provider', async () => {
    await render(<ScreenHeader title="Agenda" showAvatar />);
    expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
  });

  it('CA-12: shows no avatar when the provider value is null', async () => {
    await render(
      <HeaderAvatarProvider value={null}>
        <ScreenHeader title="Agenda" showAvatar />
      </HeaderAvatarProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
  });

  it('CA-12: shows no avatar unless showAvatar is set', async () => {
    await render(
      <HeaderAvatarProvider value={{ name: 'Maria Souza', onPress: jest.fn() }}>
        <ScreenHeader title="Agenda" />
      </HeaderAvatarProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Abrir perfil' })).not.toBeOnTheScreen();
  });

  it('renders the title as a header, the back button and at most two actions', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    const action = (label: string) => ({
      icon: 'add' as const,
      accessibilityLabel: label,
      onPress: jest.fn(),
    });
    await render(
      <ScreenHeader
        title="Novo evento"
        overline="Estaca"
        onBack={onBack}
        actions={[action('Um'), action('Dois'), action('Três')]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Novo evento' })).toBeOnTheScreen();
    expect(screen.getByText('Estaca')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Um' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Dois' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Três' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('CA-16: an action with badge shows the dot, and without it no dot is drawn', async () => {
    const action = {
      icon: 'notifications' as const,
      accessibilityLabel: 'Notificações',
      onPress: jest.fn(),
    };
    await render(<ScreenHeader title="Agenda" actions={[{ ...action, badge: true }]} />);
    expect(screen.getByTestId('header-action-badge')).toBeOnTheScreen();
    await render(<ScreenHeader title="Agenda" actions={[action]} />);
    expect(screen.queryByTestId('header-action-badge')).not.toBeOnTheScreen();
  });

  it('renders a text action and calls it when pressed', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <ScreenHeader title="Notificações" textAction={{ label: 'Ler todas', onPress }} />,
    );
    await user.press(screen.getByRole('button', { name: 'Ler todas' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
