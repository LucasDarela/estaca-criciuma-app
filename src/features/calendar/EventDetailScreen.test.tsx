import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { CalendarEvent } from '@/domain/calendar';
import { makeEvent } from '@/test/factories';

import { EventWriteError, deleteEvent, useEvent, useEventCache } from './api';
import { addToDeviceCalendar, openInMaps, shareEvent } from './eventActions';
import { EventDetailScreen } from './EventDetailScreen';
import { addMeetingItem, removeMeetingItem, useMeetingItems } from './meetingApi';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: mockPush,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => ({ id: 'conference' }),
}));
let mockPublish: string[] = [];
let mockLead: string[] = [];
jest.mock('../viewer/ViewerProvider', () => ({
  useViewer: () => ({
    canPublish: (u: string) => mockPublish.includes(u),
    canLead: (u: string) => mockLead.includes(u),
  }),
}));
jest.mock('./api', () => ({
  ...jest.createMockFromModule<object>('./api'),
  // The real class, so `instanceof` works in the screen.
  EventWriteError: jest.requireActual('./api').EventWriteError,
}));
jest.mock('./meetingApi');
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
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <EventDetailScreen />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  mockCanGoBack = true;
  mockBack.mockClear();
  mockReplace.mockClear();
  mockPush.mockClear();
  mockPublish = [];
  mockLead = [];
  (useEventCache as jest.Mock).mockReturnValue({ saved: jest.fn(), deleted: jest.fn() });
  (useMeetingItems as jest.Mock).mockReturnValue({ data: [] });
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

  const icaraEvent = makeEvent({
    id: 'icara-1',
    title: 'Noite cultural',
    unitId: 'icara',
    type: 'activity',
    startsAt: new Date('2026-11-15T22:00:00Z'),
    endsAt: new Date('2026-11-16T00:00:00Z'),
  });
  const criciumaEvent = makeEvent({ ...icaraEvent, id: 'c1-1', unitId: 'criciuma1' });

  it('[event-form] CA-02: Editar and Excluir only on an event of a unit the person publishes in', async () => {
    mockPublish = ['icara'];
    mockQuery(icaraEvent);
    await setup();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Editar' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/event/[id]/edit',
      params: { id: 'icara-1' },
    });
    await screen.unmount();

    mockQuery(criciumaEvent);
    await setup();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeOnTheScreen();
  });

  it('[event-form] CA-13: confirming the deletion deletes, shows the toast and goes to the Agenda', async () => {
    const user = userEvent.setup();
    mockPublish = ['icara'];
    mockQuery(icaraEvent);
    (deleteEvent as jest.Mock).mockResolvedValue(undefined);
    await setup();
    await user.press(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getByText('Excluir evento?')).toBeOnTheScreen();
    expect(
      screen.getByText('"Noite cultural" será removido da agenda. Não dá para desfazer.'),
    ).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Excluir' }).at(-1)!);
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith('icara-1'));
    expect(await screen.findByText('Evento excluído.')).toBeOnTheScreen();
    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });

  it('[event-form] CA-13: Cancelar does not delete', async () => {
    const user = userEvent.setup();
    mockPublish = ['icara'];
    mockQuery(icaraEvent);
    await setup();
    await user.press(screen.getByRole('button', { name: 'Excluir' }));
    await user.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it('[event-form] 7.5: a deletion that finds the event gone goes to the Agenda', async () => {
    const user = userEvent.setup();
    mockPublish = ['icara'];
    mockQuery(icaraEvent);
    (deleteEvent as jest.Mock).mockRejectedValue(new EventWriteError('not_found'));
    await setup();
    await user.press(screen.getByRole('button', { name: 'Excluir' }));
    await user.press(screen.getAllByRole('button', { name: 'Excluir' }).at(-1)!);
    expect(await screen.findByText('Este evento não está mais disponível.')).toBeOnTheScreen();
    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });

  const meetingIcara = makeEvent({ ...icaraEvent, id: 'm-icara', type: 'meeting' });
  const meetingC1 = makeEvent({ ...icaraEvent, id: 'm-c1', unitId: 'criciuma1', type: 'meeting' });

  it('[event-form] CA-14: the Icara publisher does not see the agenda card', async () => {
    mockPublish = ['icara'];
    mockLead = [];
    mockQuery(meetingIcara);
    await setup();
    expect(screen.queryByRole('button', { name: /^Pauta da reunião/ })).not.toBeOnTheScreen();
  });

  it('[event-form] CA-15: the unit leader opens the agenda sheet with the 3 tabs', async () => {
    const user = userEvent.setup();
    mockPublish = ['criciuma1'];
    mockLead = ['criciuma1'];
    mockQuery(meetingC1);
    await setup();
    await user.press(screen.getByRole('button', { name: /^Pauta da reunião/ }));
    expect(screen.getByRole('tab', { name: 'Pauta, 0' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Decisões, 0' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Pendências, 0' })).toBeOnTheScreen();
  });

  it('[event-form] CA-16: adding and removing an item writes right away', async () => {
    const user = userEvent.setup();
    mockPublish = ['criciuma1'];
    mockLead = ['criciuma1'];
    mockQuery(meetingC1);
    (useMeetingItems as jest.Mock).mockReturnValue({
      data: [{ id: 'i1', kind: 'agenda', text: 'Abertura', carriedFromDate: null }],
    });
    (addMeetingItem as jest.Mock).mockResolvedValue(undefined);
    (removeMeetingItem as jest.Mock).mockResolvedValue(undefined);
    await setup();
    await user.press(screen.getByRole('button', { name: /^Pauta da reunião/ }));
    await user.type(screen.getByLabelText('Novo assunto da pauta'), 'Oração');
    await user.press(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(addMeetingItem).toHaveBeenCalledWith('m-c1', 'agenda', 'Oração'));
    await user.press(screen.getByRole('button', { name: 'Remover "Abertura"' }));
    await waitFor(() => expect(removeMeetingItem).toHaveBeenCalledWith('i1'));
  });
});
