import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CalendarEvent } from '@/domain/calendar';
import type { CivilDate } from '@/domain/time';
import { makeEvent } from '@/test/factories';

import { WeekView } from './WeekView';

const today = { year: 2026, month: 11, day: 13 };

const friday = makeEvent({
  id: 'friday',
  title: 'Noite de jogos',
  startsAt: new Date('2026-11-13T22:00:00Z'),
  endsAt: new Date('2026-11-14T00:00:00Z'),
});
const saturday = makeEvent({
  id: 'saturday',
  title: 'Serviço comunitário',
  unitId: 'icara',
  startsAt: new Date('2026-11-14T18:00:00Z'),
  endsAt: new Date('2026-11-14T20:00:00Z'),
});

function setup(events: CalendarEvent[], selected: CivilDate = today) {
  const onSelect = jest.fn();
  const onOpenEvent = jest.fn();
  const element = (
    <WeekView
      selected={selected}
      today={today}
      events={events}
      locale="pt-BR"
      onSelect={onSelect}
      onOpenEvent={onOpenEvent}
    />
  );
  return { element, onSelect, onOpenEvent };
}

describe('WeekView', () => {
  it('CA-10: a week without events shows the empty message', async () => {
    await render(setup([]).element);

    expect(screen.getByText('Nenhum evento nesta semana com os filtros atuais.')).toBeOnTheScreen();
  });

  it('RF-09: shows the 7-day strip and a group for each day with events', async () => {
    await render(setup([friday, saturday]).element);

    expect(screen.getByRole('button', { name: '8 de novembro, sem eventos' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '14 de novembro, 1 evento' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Sex, 13 nov' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Sáb, 14 nov' })).toBeOnTheScreen();
    expect(screen.getByText('Noite de jogos')).toBeOnTheScreen();
    expect(screen.getByText('Serviço comunitário')).toBeOnTheScreen();
  });

  it('RF-09: tags only today with "Hoje"', async () => {
    await render(setup([friday, saturday]).element);

    expect(screen.getAllByText('Hoje')).toHaveLength(1);
  });

  it('does not list days without events', async () => {
    await render(setup([friday]).element);

    expect(screen.queryByRole('header', { name: 'Sáb, 14 nov' })).not.toBeOnTheScreen();
  });

  it('selects a day from the strip and opens an event', async () => {
    const { element, onSelect, onOpenEvent } = setup([friday]);
    await render(element);

    await fireEvent.press(screen.getByRole('button', { name: '10 de novembro, sem eventos' }));
    expect(onSelect).toHaveBeenCalledWith({ year: 2026, month: 11, day: 10 });

    await fireEvent.press(screen.getByRole('button', { name: /Noite de jogos/ }));
    expect(onOpenEvent).toHaveBeenCalledWith('friday');
  });
});
