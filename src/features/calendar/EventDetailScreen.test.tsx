import '@/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { CalendarEvent } from '@/domain/calendar';
import { makeEvent } from '@/test/factories';

import { useEvent } from './api';
import { addToDeviceCalendar, openInMaps, shareEvent } from './eventActions';
import { EventDetailScreen } from './EventDetailScreen';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => ({ id: 'conference' }),
}));
jest.mock('./api');
jest.mock('./eventActions');

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const conference = makeEvent({
  id: 'conference',
  title: 'Conferência de Estaca',
  unitId: 'estaca',
  type: 'conference',
  startsAt: new Date('2026-11-15T12:00:00Z'),
  endsAt: new Date('2026-11-15T15:00:00Z'),
  location: 'Centro de Estaca',
  notes: 'Sessão única para toda a estaca.',
  links: ['https://example.org/conferencia', 'https://example.org/transmissao'],
});

function mockQuery(data: CalendarEvent | null | undefined, extra: object = {}) {
  (useEvent as jest.Mock).mockReturnValue({ data, isError: false, refetch: jest.fn(), ...extra });
}

async function setup() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        <EventDetailScreen />
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  mockCanGoBack = true;
  mockBack.mockClear();
  mockReplace.mockClear();
  (openInMaps as jest.Mock).mockResolvedValue(undefined);
  (shareEvent as jest.Mock).mockResolvedValue(undefined);
  (addToDeviceCalendar as jest.Mock).mockResolvedValue('saved');
  mockQuery(conference);
});

afterEach(() => jest.restoreAllMocks());

describe('EventDetailScreen', () => {
  it('CA-13: shows every field and the three actions', async () => {
    await setup();

    expect(screen.getByText('Conferência')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Conferência de Estaca' })).toBeOnTheScreen();
    expect(screen.getByText('Domingo, 15 de novembro de 2026')).toBeOnTheScreen();
    expect(screen.getByText('09:00 – 12:00')).toBeOnTheScreen();
    expect(screen.getByText('Centro de Estaca')).toBeOnTheScreen();
    expect(screen.getByText('Estaca')).toBeOnTheScreen();
    expect(screen.getByText('Notas')).toBeOnTheScreen();
    expect(screen.getByText('Sessão única para toda a estaca.')).toBeOnTheScreen();
    expect(screen.getByText('Links')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'https://example.org/conferencia' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'https://example.org/transmissao' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Adicionar à agenda' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeOnTheScreen();
  });

  it('CA-20: shows 19:30 for an event at 19:30 in Sao Paulo whatever the device zone', async () => {
    mockQuery(
      makeEvent({
        startsAt: new Date('2026-11-13T22:30:00Z'),
        endsAt: new Date('2026-11-14T00:30:00Z'),
      }),
    );
    await setup();

    expect(screen.getByText('19:30 – 21:30')).toBeOnTheScreen();
  });

  it('RF-12: shows the range of days for a multi-day event', async () => {
    mockQuery(
      makeEvent({
        startsAt: new Date('2026-11-14T21:00:00Z'),
        endsAt: new Date('2026-11-16T15:00:00Z'),
      }),
    );
    await setup();

    expect(screen.getByText('14 de novembro – 16 de novembro de 2026')).toBeOnTheScreen();
  });

  it('hides the map link, notes and links for an event without them', async () => {
    mockQuery(makeEvent({ location: '', notes: '', links: [] }));
    await setup();

    expect(screen.queryByRole('link', { name: 'Abrir no mapa' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Notas')).not.toBeOnTheScreen();
    expect(screen.queryByText('Links')).not.toBeOnTheScreen();
  });

  it('CA-14: "Abrir no mapa" opens the place in the maps app', async () => {
    await setup();

    await fireEvent.press(screen.getByRole('link', { name: 'Abrir no mapa' }));

    expect(openInMaps).toHaveBeenCalledWith('Centro de Estaca');
  });

  it('opens a link in the browser', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await setup();

    await fireEvent.press(screen.getByRole('link', { name: 'https://example.org/transmissao' }));

    expect(open).toHaveBeenCalledWith('https://example.org/transmissao');
  });

  it('CA-15: "Adicionar à agenda" opens the dialog and confirms with the toast when saved', async () => {
    await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar à agenda' }));

    expect(addToDeviceCalendar).toHaveBeenCalledWith(conference);
    expect(await screen.findByText('Evento adicionado à sua agenda.')).toBeOnTheScreen();
  });

  it('CA-15: shows no toast when the dialog was cancelled', async () => {
    (addToDeviceCalendar as jest.Mock).mockResolvedValue('other');
    await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar à agenda' }));

    await waitFor(() => expect(addToDeviceCalendar).toHaveBeenCalled());
    expect(screen.queryByText('Evento adicionado à sua agenda.')).not.toBeOnTheScreen();
  });

  it('shows the calendar unavailable toast when the dialog cannot open', async () => {
    (addToDeviceCalendar as jest.Mock).mockRejectedValue(new Error('unavailable'));
    await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar à agenda' }));

    expect(
      await screen.findByText('Não foi possível abrir a agenda do celular.'),
    ).toBeOnTheScreen();
  });

  it('CA-16: "Compartilhar" shares the event with its date and unit', async () => {
    await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(shareEvent).toHaveBeenCalledWith(conference, {
      date: 'Domingo, 15 de novembro de 2026',
      unitName: 'Estaca',
    });
  });

  it('CA-17: an unknown event shows the gone message and "Ver agenda"', async () => {
    mockQuery(null);
    await setup();

    expect(screen.getByText('Este evento não está mais disponível.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ver agenda' }));

    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });

  it('shows a skeleton while the event loads', async () => {
    mockQuery(undefined);
    await setup();

    expect(screen.getByTestId('event-skeleton')).toBeOnTheScreen();
  });

  it('offers a retry when loading fails with nothing cached', async () => {
    const refetch = jest.fn();
    mockQuery(undefined, { isError: true, refetch });
    await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalled();
  });

  it('goes back through the router, or to the agenda when there is no history', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockBack).toHaveBeenCalled();

    mockCanGoBack = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });
});
