import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { CalendarEvent } from '@/domain/calendar';
import type { UnitId } from '@/domain/units';
import { PushError, sendPush } from '@/lib/push';

import { EventWriteError, createEvent, updateEvent } from './api';
import { EventFormScreen } from './EventFormScreen';
import { EventFormRoute } from './EventFormRoute';
import { addMeetingItem } from './meetingApi';
import { useDateTimePicker } from './useDateTimePicker';

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'e1' }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${String(href)}`}</Text>;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/lib/push', () => ({
  ...jest.requireActual('@/lib/push'),
  sendPush: jest.fn(),
}));
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
}));
jest.mock('./meetingApi', () => ({
  ...jest.requireActual('./meetingApi'),
  addMeetingItem: jest.fn(),
  removeMeetingItem: jest.fn(),
  fetchMeetingItems: jest.fn().mockResolvedValue([]),
}));
jest.mock('./useDateTimePicker');
let mockViewer: {
  loaded: boolean;
  publishableUnits: UnitId[];
  canLead: (u: UnitId) => boolean;
  canPublish: (u: UnitId) => boolean;
};
jest.mock('../viewer/ViewerProvider', () => ({ useViewer: () => mockViewer }));

const open = jest.fn();
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const storedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'new-id',
  unitId: 'icara',
  type: 'activity',
  title: 'Noite',
  startsAt: '2026-11-12T22:30:00.000Z',
  endsAt: '2026-11-13T00:30:00.000Z',
  location: '',
  notes: '',
  links: [],
  ...overrides,
});

function viewerOf(units: UnitId[], leadable: UnitId[] = []) {
  mockViewer = {
    loaded: true,
    publishableUnits: units,
    canLead: (u) => leadable.includes(u),
    canPublish: (u) => units.includes(u),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date('2026-11-13T13:00:00Z'), // 10:00 in Sao Paulo
    advanceTimers: true,
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'clearImmediate',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  (useDateTimePicker as jest.Mock).mockReturnValue({ open, element: null });
  (createEvent as jest.Mock).mockResolvedValue(storedEvent());
  (updateEvent as jest.Mock).mockResolvedValue(storedEvent({ id: 'e1' }));
  (sendPush as jest.Mock).mockResolvedValue({ recipients: 3 });
  mockRouter.canGoBack.mockReturnValue(true);
  viewerOf(['icara']);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

async function setup(props: React.ComponentProps<typeof EventFormScreen> = { mode: 'new' }) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client()}>
        <ToastProvider>
          <EventFormScreen {...props} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return userEvent.setup();
}

/** Drives the (mocked) native picker: the last open() call receives the picked instant. */
async function pick(instant: string) {
  const onPick = open.mock.calls.at(-1)?.[2] as (d: Date) => void;
  await act(async () => onPick(new Date(instant)));
}

const nameField = () => screen.getByLabelText('Nome do evento');
const saveButton = () => screen.getByRole('button', { name: 'Salvar' });

async function fillName(user: Awaited<ReturnType<typeof setup>>, name = 'Noite cultural') {
  await user.type(nameField(), name);
}

const existing: CalendarEvent = {
  id: 'e1',
  unitId: 'icara',
  type: 'activity',
  title: 'Noite',
  startsAt: new Date('2026-11-12T22:30:00Z'),
  endsAt: new Date('2026-11-13T00:30:00Z'),
  location: 'Capela',
  notes: '',
  links: [],
};

describe('[event-form] EventFormScreen validation', () => {
  it('CA-03: an empty name shows the message on blur and disables Salvar', async () => {
    const user = await setup();
    await user.press(nameField());
    await fireEvent(nameField(), 'blur');
    expect(screen.getByText('Informe o nome do evento.')).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  it('CA-04: an end before the start shows the message', async () => {
    const user = await setup();
    await user.press(screen.getByRole('button', { name: /^Início, \d\d:\d\d$/ }));
    await pick('2026-11-13T22:30:00Z'); // 19:30
    await user.press(screen.getByRole('button', { name: /^Fim, \d\d:\d\d$/ }));
    await pick('2026-11-13T22:00:00Z'); // 19:00
    expect(await screen.findByText('O fim precisa ser depois do início.')).toBeOnTheScreen();
  });

  it('CA-05: unchecking "Somente nesta data" shows the end date and saves across days', async () => {
    const user = await setup();
    await fillName(user);
    expect(screen.getAllByRole('button', { name: /^Fim, / })).toHaveLength(1);
    await user.press(screen.getByRole('checkbox', { name: 'Somente nesta data' }));
    expect(screen.getAllByRole('button', { name: /^Fim, / })).toHaveLength(2);

    await user.press(screen.getAllByRole('button', { name: /^Fim, / })[0]);
    await pick('2026-11-15T15:00:00Z'); // 12:00 on the 15th
    await user.press(screen.getByRole('button', { name: /^Início, \d\d:\d\d$/ }));
    await pick('2026-11-13T22:30:00Z');
    await user.press(screen.getByRole('button', { name: /^Fim, \d\d:\d\d$/ }));
    await pick('2026-11-15T15:00:00Z');
    await user.press(saveButton());
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    const input = (createEvent as jest.Mock).mock.calls[0][1];
    expect(input.endsAt.getTime()).toBeGreaterThan(input.startsAt.getTime() + 24 * 3_600_000);
  });

  it('CA-06: the publisher of Içara only sees the Içara chip', async () => {
    await setup();
    expect(screen.getByRole('radio', { name: 'Içara' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Criciúma 1' })).toBeNull();
  });

  it('CA-07: an http link is rejected', async () => {
    const user = await setup();
    await user.type(screen.getByLabelText('Links'), 'http://x.org');
    await user.press(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('Informe um link que comece com https://.')).toBeOnTheScreen();
  });

  it('RF-09: an https link is added and can be removed', async () => {
    const user = await setup();
    await user.type(screen.getByLabelText('Links'), 'https://x.org');
    await user.press(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('https://x.org')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remover https://x.org' }));
    expect(screen.queryByText('https://x.org')).toBeNull();
  });

  it('CA-08: clearing every audience chip shows the message and disables Salvar', async () => {
    const user = await setup();
    await fillName(user);
    expect(saveButton()).not.toBeDisabled();
    await user.press(screen.getByLabelText('Todos da ala'));
    expect(
      screen.getAllByText('Selecione ao menos um grupo para enviar a notificação.').length,
    ).toBeGreaterThan(0);
    expect(saveButton()).toBeDisabled();
  });

  it('CA-23: Treinamento, a 160 character location and 1001 notes block saving until 1000', async () => {
    const user = await setup();
    await fillName(user);
    await user.press(screen.getByRole('radio', { name: 'Treinamento' }));
    await fireEvent.changeText(screen.getByLabelText('Local'), 'a'.repeat(160));
    await fireEvent.changeText(screen.getByLabelText('Notas'), 'b'.repeat(1001));
    await fireEvent(screen.getByLabelText('Notas'), 'blur');
    expect(screen.getByText('Use até 1000 caracteres.')).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Notas'), 'b'.repeat(1000));
    await user.press(saveButton());
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    const input = (createEvent as jest.Mock).mock.calls[0][1];
    expect(input.type).toBe('training');
    expect(input.location).toBe('a'.repeat(160));
  });

  it('RNF-10: tapping an invalid Salvar shows the name error and announces it', async () => {
    const user = await setup();
    await user.press(saveButton());
    expect(screen.getByText('Informe o nome do evento.')).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Informe o nome do evento.',
    );
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('RNF-06, RNF-07: checkboxes and chips expose their roles', async () => {
    await setup();
    expect(screen.getByRole('checkbox', { name: 'Somente nesta data' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Notificar' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Atividade' })).toBeChecked();
  });
});

describe('[event-form] EventFormScreen saving', () => {
  it('CA-09: saves with Notificar, calls sendPush and goes to the detail', async () => {
    const user = await setup();
    await fillName(user);
    await user.press(saveButton());
    await waitFor(() => expect(sendPush).toHaveBeenCalled());
    expect((sendPush as jest.Mock).mock.calls[0][0]).toMatchObject({
      kind: 'event',
      itemId: 'new-id',
    });
    expect((sendPush as jest.Mock).mock.calls[0][0].audience[0]).toBe('all');
    expect(await screen.findByText('Evento salvo e aviso enviado')).toBeOnTheScreen();
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/event/[id]',
      params: { id: 'new-id' },
    });
  });

  it('CA-10: a failed push keeps the event saved and shows the push message', async () => {
    (sendPush as jest.Mock).mockRejectedValue(new PushError('unavailable'));
    const user = await setup();
    await fillName(user);
    await user.press(saveButton());
    expect(
      await screen.findByText(/O item foi salvo, mas o aviso não foi enviado/),
    ).toBeOnTheScreen();
    expect(createEvent).toHaveBeenCalledTimes(1);
  });

  it('RF-12: without Notificar the toast is "Evento salvo" and no push is sent', async () => {
    const user = await setup();
    await fillName(user);
    await user.press(screen.getByRole('checkbox', { name: 'Notificar' }));
    await user.press(saveButton());
    expect(await screen.findByText('Evento salvo')).toBeOnTheScreen();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('CA-20: 19:30 on a Lisbon device is sent as 22:30Z', async () => {
    const user = await setup();
    await fillName(user);
    await user.press(screen.getByRole('button', { name: /^Início, \d\d:\d\d$/ }));
    await pick('2026-11-12T22:30:00Z');
    await user.press(screen.getAllByRole('button', { name: /^Início, / })[0]);
    await pick('2026-11-12T15:00:00Z'); // the date (12/11)
    await user.press(screen.getByRole('button', { name: /^Fim, \d\d:\d\d$/ }));
    await pick('2026-11-13T00:30:00Z');
    await user.press(saveButton());
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    const { startsAt } = (createEvent as jest.Mock).mock.calls[0][1];
    expect(startsAt.toISOString()).toBe('2026-11-12T22:30:00.000Z');
  });

  it('CA-21: two taps on Salvar create a single event', async () => {
    let resolve: (value: unknown) => void = () => {};
    (createEvent as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)));
    const user = await setup();
    await fillName(user);
    await user.press(saveButton());
    await user.press(screen.getByRole('button', { name: 'Salvando...' }));
    expect(createEvent).toHaveBeenCalledTimes(1);
    resolve(storedEvent());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  });

  it('7.5: forbidden shows the permission message and goes back', async () => {
    (createEvent as jest.Mock).mockRejectedValue(new EventWriteError('forbidden'));
    const user = await setup();
    await fillName(user);
    await user.press(saveButton());
    expect(
      await screen.findByText('Você não tem mais permissão para publicar nesta unidade.'),
    ).toBeOnTheScreen();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('7.5: not_found shows "not available" and goes to the Agenda', async () => {
    (updateEvent as jest.Mock).mockRejectedValue(new EventWriteError('not_found'));
    const user = await setup({ mode: 'edit', event: existing });
    await user.type(nameField(), ' 2');
    await user.press(saveButton());
    expect(await screen.findByText('Este evento não está mais disponível.')).toBeOnTheScreen();
    expect(mockRouter.replace).toHaveBeenCalledWith('/agenda');
  });

  it('7.5: a network failure keeps what was typed', async () => {
    (createEvent as jest.Mock).mockRejectedValue(new EventWriteError('network'));
    const user = await setup();
    await fillName(user);
    await user.press(saveButton());
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeOnTheScreen();
    expect(nameField().props.value).toBe('Noite cultural');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('RF-12 (edit): Notificar starts unchecked, saving shows "Evento salvo" and goes back', async () => {
    const user = await setup({ mode: 'edit', event: existing });
    expect(screen.getByRole('checkbox', { name: 'Notificar' })).not.toBeChecked();
    expect(screen.getByText('Editar evento')).toBeOnTheScreen();
    await user.type(nameField(), ' 2');
    await user.press(saveButton());
    expect(await screen.findByText('Evento salvo')).toBeOnTheScreen();
    expect(updateEvent).toHaveBeenCalledWith('e1', expect.objectContaining({ title: 'Noite 2' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('[event-form] EventFormScreen cancel, unit and agenda', () => {
  it('CA-11: Cancelar with changes asks to discard, and Continuar editando keeps the name', async () => {
    const user = await setup();
    await fillName(user);
    await user.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Descartar alterações?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(nameField().props.value).toBe('Noite cultural');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('RF-13: Cancelar without changes goes back at once', async () => {
    const user = await setup();
    await user.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('CA-12: changing the unit clears the audience and swaps the options', async () => {
    viewerOf(['estaca', 'icara']);
    const user = await setup();
    await user.press(screen.getByRole('radio', { name: 'Içara' }));
    expect(screen.getByRole('radio', { name: 'Içara' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Estaca' }));
    expect(screen.getByRole('radio', { name: 'Estaca' })).toBeChecked();
    expect(
      screen.getAllByText('Selecione ao menos um grupo para enviar a notificação.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText('Toda a estaca')).toBeOnTheScreen();
  });

  it('CA-19: switching a meeting with items to Atividade asks to remove the agenda', async () => {
    viewerOf(['criciuma1'], ['criciuma1']);
    const user = await setup();
    await fillName(user);
    await user.press(screen.getByRole('radio', { name: 'Reunião' }));
    await user.press(screen.getByRole('button', { name: /^Pauta da reunião/ }));
    await user.type(screen.getByLabelText('Novo assunto da pauta'), 'Oração');
    // The link form has its own "Adicionar"; the sheet's is the last one.
    await user.press(screen.getAllByRole('button', { name: 'Adicionar' }).at(-1)!);
    await user.press(screen.getByRole('button', { name: 'Concluir' }));

    await user.press(screen.getByRole('radio', { name: 'Atividade' }));
    expect(screen.getByText('Remover a pauta?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.queryByRole('button', { name: /^Pauta da reunião/ })).toBeNull();

    await user.press(saveButton());
    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    expect((createEvent as jest.Mock).mock.calls[0][2]).toEqual([]);
  });

  it('CA-19: in edit mode the type change reaches updateEvent', async () => {
    viewerOf(['icara']);
    const user = await setup({ mode: 'edit', event: { ...existing, type: 'meeting' } });
    await user.press(screen.getByRole('radio', { name: 'Atividade' }));
    await user.press(saveButton());
    await waitFor(() => expect(updateEvent).toHaveBeenCalled());
    expect((updateEvent as jest.Mock).mock.calls[0][1].type).toBe('activity');
  });

  it('CA-16: in an existing meeting, adding to the agenda writes right away', async () => {
    viewerOf(['criciuma1'], ['criciuma1']);
    const user = await setup({
      mode: 'edit',
      event: { ...existing, unitId: 'criciuma1', type: 'meeting' },
    });
    await user.press(screen.getByRole('button', { name: /^Pauta da reunião/ }));
    await user.type(screen.getByLabelText('Novo assunto da pauta'), 'Oração');
    await user.press(screen.getAllByRole('button', { name: 'Adicionar' }).at(-1)!);
    await waitFor(() => expect(addMeetingItem).toHaveBeenCalledWith('e1', 'agenda', 'Oração'));
  });

  it('RF-17: a publisher who cannot lead does not see the agenda card', async () => {
    viewerOf(['icara'], []);
    const user = await setup();
    await user.press(screen.getByRole('radio', { name: 'Reunião' }));
    expect(screen.queryByRole('button', { name: /^Pauta da reunião/ })).toBeNull();
  });
});

describe('[event-form] EventFormRoute', () => {
  it('RF-01: without a publishable unit it redirects to the Agenda', async () => {
    viewerOf([]);
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <EventFormRoute />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('redirect:/agenda')).toBeOnTheScreen();
  });
});
