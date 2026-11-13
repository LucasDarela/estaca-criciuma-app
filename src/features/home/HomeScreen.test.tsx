import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it('shows the stake signature as the screen header', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header', { name: 'Estaca Criciúma' })).toBeOnTheScreen();
  });

  it('shows translated copy in pt-BR by default', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('SANTA CATARINA · BRASIL')).toBeOnTheScreen();
    expect(screen.getByText('Em breve: agenda, mural e liderança da estaca.')).toBeOnTheScreen();
  });
});
