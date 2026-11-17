import '@/i18n';

import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MeetingItem } from '@/domain/meetingItems';

import { MeetingAgendaCard } from './MeetingAgendaCard';
import { MeetingAgendaSheet } from './MeetingAgendaSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

const items: MeetingItem[] = [
  {
    id: 'a1',
    kind: 'agenda',
    text: 'Definir recepção',
    carriedFromDate: { year: 2026, month: 10, day: 15 },
  },
  { id: 'a2', kind: 'agenda', text: 'Oração', carriedFromDate: null },
  { id: 'd1', kind: 'decision', text: 'Aprovado', carriedFromDate: null },
  { id: 'p1', kind: 'pending', text: 'Comprar cadeiras', carriedFromDate: null },
];

async function setup(overrides: Partial<React.ComponentProps<typeof MeetingAgendaSheet>> = {}) {
  const onAdd = jest.fn();
  const onRemove = jest.fn();
  const onClose = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MeetingAgendaSheet
        visible
        title="Conselho da ala"
        items={items}
        busy={false}
        onAdd={onAdd}
        onRemove={onRemove}
        onClose={onClose}
        {...overrides}
      />
    </SafeAreaProvider>,
  );
  return { onAdd, onRemove, onClose, user: userEvent.setup() };
}

describe('MeetingAgendaSheet', () => {
  it('CA-15: shows the title, the 3 tabs with their counts and the hint of each tab', async () => {
    const { user } = await setup();
    expect(screen.getByText('REUNIÃO')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Conselho da ala' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Pauta, 2' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Decisões, 1' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Pendências, 1' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Assuntos a tratar. Pendências da reunião anterior entram aqui automaticamente.',
      ),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('tab', { name: 'Decisões, 1' }));
    expect(
      screen.getByText('O que foi decidido. Preencha durante ou depois da reunião.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('tab', { name: 'Pendências, 1' }));
    expect(
      screen.getByText('O que fica para a próxima reunião — será levado para a pauta dela.'),
    ).toBeOnTheScreen();
  });

  it('CA-15: falls back to "Reunião" when the event has no name yet', async () => {
    await setup({ title: '  ' });
    expect(screen.getByRole('header', { name: 'Reunião' })).toBeOnTheScreen();
  });

  it('CA-16: adds an item with the + button and clears the field', async () => {
    const { user, onAdd } = await setup();
    const field = screen.getByLabelText('Novo assunto da pauta');
    await user.type(field, 'Oração final');
    await user.press(screen.getByRole('button', { name: 'Adicionar' }));
    expect(onAdd).toHaveBeenCalledWith('agenda', 'Oração final');
    expect(field.props.value).toBe('');
  });

  it('CA-16: Enter also adds, on the tab that is open', async () => {
    const { user, onAdd } = await setup();
    await user.press(screen.getByRole('tab', { name: 'Decisões, 1' }));
    const field = screen.getByLabelText('Registrar decisão');
    await user.type(field, 'Aprovar orçamento');
    await fireEvent(field, 'submitEditing');
    expect(onAdd).toHaveBeenCalledWith('decision', 'Aprovar orçamento');
  });

  it('CA-16: blank text adds nothing', async () => {
    const { user, onAdd } = await setup();
    await user.type(screen.getByLabelText('Novo assunto da pauta'), '   ');
    await user.press(screen.getByRole('button', { name: 'Adicionar' }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('CA-16: removes an item and lists the agenda numbered from 1', async () => {
    const { user, onRemove } = await setup();
    expect(screen.getByTestId('marker-1')).toHaveTextContent('1');
    expect(screen.getByTestId('marker-2')).toHaveTextContent('2');
    await user.press(screen.getByRole('button', { name: 'Remover "Oração"' }));
    expect(onRemove).toHaveBeenCalledWith(items[1]);
  });

  it('RF-19: a busy sheet cannot add or remove', async () => {
    const { user, onAdd, onRemove } = await setup({ busy: true });
    await user.press(screen.getByRole('button', { name: 'Adicionar' }));
    await user.press(screen.getByRole('button', { name: 'Remover "Oração"' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('RNF-09: a carried item announces its tag, and the remove button names the item', async () => {
    await setup();
    expect(screen.getByText('Pendente da reunião de 15/10')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Definir recepção, Pendente da reunião de 15/10'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remover "Definir recepção"' })).toBeOnTheScreen();
  });

  it('RNF-09, RF-19: a pending item carries the "next meeting" tag', async () => {
    const { user } = await setup();
    await user.press(screen.getByRole('tab', { name: 'Pendências, 1' }));
    expect(screen.getByText('Vai para a próxima reunião')).toBeOnTheScreen();
    expect(screen.getByLabelText('Comprar cadeiras, Vai para a próxima reunião')).toBeOnTheScreen();
  });

  it('Concluir closes the sheet', async () => {
    const { user, onClose } = await setup();
    await user.press(screen.getByRole('button', { name: 'Concluir' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MeetingAgendaCard', () => {
  it('CA-14, RF-17: summarizes the counts and opens the sheet', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <MeetingAgendaCard counts={{ agenda: 2, decision: 1, pending: 3 }} onPress={onPress} />,
    );
    expect(screen.getByText('Pauta da reunião')).toBeOnTheScreen();
    expect(screen.getByText('2 na pauta · 1 decisão · 3 pendentes')).toBeOnTheScreen();
    await user.press(
      screen.getByRole('button', {
        name: 'Pauta da reunião, 2 na pauta · 1 decisão · 3 pendentes',
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
