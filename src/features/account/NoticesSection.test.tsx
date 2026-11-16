import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { Organization } from '@/domain/profile';

import { updateProfile } from './api';
import { NoticesSection } from './NoticesSection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('./api', () => ({ updateProfile: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function setup(organizations: Organization[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NoticesSection userId="u1" organizations={organizations} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  (updateProfile as jest.Mock).mockResolvedValue(undefined);
});

describe('NoticesSection', () => {
  it('RF-21: shows the section, the history link, the six groups and the hint', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'Avisos' })).toBeOnTheScreen();
    expect(screen.getByText('Grupos que acompanho')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Templo e História da Família' })).toBeOnTheScreen();
    for (const label of [
      'Sociedade de Socorro',
      'Quórum de Élderes',
      'Moças',
      'Rapazes',
      'Primária',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    expect(
      screen.getByText('Você recebe avisos enviados para os grupos marcados.'),
    ).toBeOnTheScreen();
  });

  it('"Notificações" opens /notifications', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Notificações' }));
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('CA-20: checking Primária saves organizations with primary and refreshes the viewer', async () => {
    const { invalidate } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Primária' }));
    await act(async () => undefined);
    expect(updateProfile).toHaveBeenCalledWith('u1', { organizations: ['primary'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['viewer'] });
  });

  it('keeps the other groups and the order of the options when adding one', async () => {
    await setup(['primary']);
    await fireEvent.press(screen.getByRole('button', { name: 'Sociedade de Socorro' }));
    expect(updateProfile).toHaveBeenCalledWith('u1', {
      organizations: ['relief_society', 'primary'],
    });
  });

  it('unchecking a group removes only it', async () => {
    await setup(['relief_society', 'primary']);
    await fireEvent.press(screen.getByRole('button', { name: 'Primária' }));
    expect(updateProfile).toHaveBeenCalledWith('u1', { organizations: ['relief_society'] });
  });

  it('a failure shows the generic error and goes back to the previous state', async () => {
    (updateProfile as jest.Mock).mockRejectedValue(new Error('down'));
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Primária' }));
    await act(async () => undefined);
    expect(screen.getByText('Algo deu errado. Tente de novo.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Primária' })).not.toBeSelected();
  });
});
