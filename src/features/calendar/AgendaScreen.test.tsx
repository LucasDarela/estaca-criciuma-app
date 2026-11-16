import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { CalendarEvent } from '@/domain/calendar';
import { useIsOnline } from '@/lib/network';
import { useHasUnread } from '@/lib/notificationInbox';
import { makeEvent } from '@/test/factories';

import { AgendaScreen } from './AgendaScreen';
import { useEventsAround } from './api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('./api');
jest.mock('@/lib/network');
jest.mock('@/lib/notificationInbox');

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Screen() {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <AgendaScreen />
    </SafeAreaProvider>
  );
}

// 13/11/2026 at 12:00 in Sao Paulo
const NOW = new Date('2026-11-13T15:00:00Z');

const council = makeEvent({
  id: 'council',
  title: 'Conselho da Ala Içara',
  unitId: 'icara',
  type: 'meeting',
  startsAt: new Date('2026-11-13T23:00:00Z'),
  endsAt: new Date('2026-11-14T00:30:00Z'),
});
const games = makeEvent({
  id: 'games',
  title: 'Noite de jogos',
  unitId: 'criciuma2',
  type: 'activity',
  startsAt: new Date('2026-11-13T22:00:00Z'),
  endsAt: new Date('2026-11-14T00:00:00Z'),
});
const conference = makeEvent({
  id: 'conference',
  title: 'Conferência de Estaca',
  unitId: 'estaca',
  type: 'conference',
  startsAt: new Date('2026-11-13T12:00:00Z'),
  endsAt: new Date('2026-11-13T15:00:00Z'),
});
const otherDay = makeEvent({
  id: 'other',
  title: 'Evento de outro dia',
  startsAt: new Date('2026-11-20T22:00:00Z'),
  endsAt: new Date('2026-11-21T00:00:00Z'),
});

function mockAgenda(
  events: CalendarEvent[],
  status: 'loading' | 'error' | 'success' = 'success',
  refetch = jest.fn(),
) {
  (useEventsAround as jest.Mock).mockReturnValue({ events, status, refetch });
  return refetch;
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  mockPush.mockClear();
  (useIsOnline as jest.Mock).mockReturnValue(true);
  (useHasUnread as jest.Mock).mockReturnValue(false);
  mockAgenda([council, games, conference, otherDay]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('AgendaScreen', () => {
  it('CA-03: shows the title, the month, the selected day 13 and its events', async () => {
    await render(<Screen />);

    expect(screen.getByText('Agenda')).toBeOnTheScreen();
    expect(screen.getByText('ESTACA CRICIÚMA')).toBeOnTheScreen();
    expect(screen.getByText('Novembro 2026')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /^Hoje, 13 de novembro/, selected: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Sexta-feira, 13 de novembro')).toBeOnTheScreen();
    expect(screen.getByText('3 eventos')).toBeOnTheScreen();
    expect(screen.getByText('Noite de jogos')).toBeOnTheScreen();
    expect(screen.queryByText('Evento de outro dia')).not.toBeOnTheScreen();
  });

  it('CA-07: next month from 31/01 selects the last day of February', async () => {
    jest.setSystemTime(new Date('2027-01-31T15:00:00Z'));
    mockAgenda([]);
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Próximo' }));

    expect(screen.getByText('Fevereiro 2027')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /^28 de fevereiro/, selected: true }),
    ).toBeOnTheScreen();
  });

  it('CA-08: "Hoje" returns to the current date after navigating', async () => {
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Próximo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('Janeiro 2027')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Hoje' }));

    expect(screen.getByText('Novembro 2026')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /^Hoje, 13 de novembro/, selected: true }),
    ).toBeOnTheScreen();
  });

  it('moves one week and one day in the other views, with the labels of RF-07', async () => {
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Semana' }));
    expect(screen.getByText('8 nov – 14 nov')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('15 nov – 21 nov')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Dia' }));
    expect(screen.getByText('Sex, 20 nov')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Qui, 19 nov')).toBeOnTheScreen();
  });

  it('CA-05: the unit filter keeps only events of that unit', async () => {
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Unidade: Todas' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Içara' }));

    expect(screen.getByText('Conselho da Ala Içara')).toBeOnTheScreen();
    expect(screen.queryByText('Noite de jogos')).not.toBeOnTheScreen();
    expect(screen.queryByText('Conferência de Estaca')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Unidade: Içara' })).toBeOnTheScreen();
  });

  it('CA-06: the type chip keeps only events of that type', async () => {
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Reuniões' }));

    expect(screen.getByText('Conselho da Ala Içara')).toBeOnTheScreen();
    expect(screen.queryByText('Noite de jogos')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reuniões', selected: true })).toBeOnTheScreen();
  });

  it('CA-04: the search ignores case and accents', async () => {
    await render(<Screen />);

    await fireEvent.changeText(screen.getByLabelText('Buscar evento'), 'CONFERENCIA');

    expect(screen.getByText('Conferência de Estaca')).toBeOnTheScreen();
    expect(screen.queryByText('Noite de jogos')).not.toBeOnTheScreen();
  });

  it('shows the empty message when the filters leave nothing', async () => {
    await render(<Screen />);

    await fireEvent.changeText(screen.getByLabelText('Buscar evento'), 'nada disso');

    expect(screen.getByText('Nenhum evento neste dia com os filtros atuais.')).toBeOnTheScreen();
  });

  it('CA-21: the bell opens /notifications', async () => {
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Notificações' }));

    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('CA-16: with unread notifications the bell shows the dot and says so (RNF-12, CA-24)', async () => {
    (useHasUnread as jest.Mock).mockReturnValue(true);
    await render(<Screen />);

    expect(screen.getByTestId('header-action-badge')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Notificações, há não lidas' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Notificações' })).not.toBeOnTheScreen();
  });

  it('CA-16: without unread notifications there is no dot and the label is plain', async () => {
    await render(<Screen />);

    expect(screen.queryByTestId('header-action-badge')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Notificações' })).toBeOnTheScreen();
  });

  it('opens the event detail from a card', async () => {
    await render(<Screen />);

    await fireEvent.press(screen.getByRole('button', { name: /Noite de jogos/ }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'games' } });
  });

  it('RF-17: shows the skeleton on the first load', async () => {
    mockAgenda([], 'loading');
    await render(<Screen />);

    expect(screen.getByTestId('agenda-skeleton')).toBeOnTheScreen();
    expect(
      screen.queryByText('Nenhum evento neste dia com os filtros atuais.'),
    ).not.toBeOnTheScreen();
  });

  it('CA-18: shows the error message and retries', async () => {
    const refetch = mockAgenda([], 'error');
    await render(<Screen />);

    expect(screen.getByText('Não foi possível carregar a agenda.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('CA-19: offline with data shows the offline banner', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(false);
    await render(<Screen />);

    expect(screen.getByText('Sem conexão. Mostrando a última versão salva.')).toBeOnTheScreen();
    expect(screen.getByText('Noite de jogos')).toBeOnTheScreen();
  });

  it('CA-19: online shows no offline banner', async () => {
    await render(<Screen />);

    expect(
      screen.queryByText('Sem conexão. Mostrando a última versão salva.'),
    ).not.toBeOnTheScreen();
  });

  it('RNF-09: the period label is a polite live region', async () => {
    await render(<Screen />);

    expect(screen.getByText('Novembro 2026')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  it('follows the clock: today moves at midnight in Sao Paulo', async () => {
    await render(<Screen />);
    await act(async () => {
      jest.setSystemTime(new Date('2026-11-14T03:30:00Z'));
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('button', { name: /^Hoje, 14 de novembro/ })).toBeOnTheScreen();
  });
});
