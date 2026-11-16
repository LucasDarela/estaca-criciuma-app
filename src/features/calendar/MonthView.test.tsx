import '@/i18n';

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { CalendarEvent } from '@/domain/calendar';
import type { CivilDate } from '@/domain/time';
import { makeEvent } from '@/test/factories';

import { MonthView } from './MonthView';

const today = { year: 2026, month: 11, day: 13 };
const date = (day: number): CivilDate => ({ year: 2026, month: 11, day });

// 14/11 18:00 to 16/11 12:00 in Sao Paulo
const trip = makeEvent({
  id: 'trip',
  title: 'Caravana ao Templo',
  type: 'caravan',
  unitId: 'criciuma3',
  location: 'Capela Criciúma 3',
  startsAt: new Date('2026-11-14T21:00:00Z'),
  endsAt: new Date('2026-11-16T15:00:00Z'),
});

function at(day: number, unitId: CalendarEvent['unitId']) {
  return makeEvent({
    unitId,
    startsAt: new Date(Date.UTC(2026, 10, day, 22)),
    endsAt: new Date(Date.UTC(2026, 10, day + 1, 0)),
  });
}

function setup(selected: CivilDate, events: CalendarEvent[]) {
  const onSelect = jest.fn();
  const onOpenEvent = jest.fn();
  const element = (current: CivilDate) => (
    <MonthView
      selected={current}
      today={today}
      events={events}
      locale="pt-BR"
      onSelect={onSelect}
      onOpenEvent={onOpenEvent}
    />
  );
  return { element, onSelect, onOpenEvent };
}

describe('MonthView', () => {
  it('RF-08: lays out the month in 35 day buttons starting on Sunday 01/11', async () => {
    await render(setup(date(13), []).element(date(13)));

    const days = screen.getAllByRole('button');
    expect(days).toHaveLength(35);
    expect(days[0]).toHaveAccessibleName('1 de novembro, sem eventos');
  });

  it('CA-09: a day with four units shows three dots', async () => {
    const events = [at(18, 'estaca'), at(18, 'icara'), at(18, 'ararangua'), at(18, 'criciuma2')];
    await render(setup(date(13), events).element(date(13)));

    const cell = screen.getByRole('button', { name: '18 de novembro, 4 eventos' });
    expect(within(cell).getAllByTestId('unit-dot')).toHaveLength(3);
  });

  it('CA-12: shows the start, "Dia todo" and "até" on the days of a multi-day event', async () => {
    const { element } = setup(date(14), [trip]);
    const view = await render(element(date(14)));
    expect(screen.getByText('18:00 · Caravana')).toBeOnTheScreen();

    await view.rerender(element(date(15)));
    expect(screen.getByText('Dia todo · Caravana')).toBeOnTheScreen();

    await view.rerender(element(date(16)));
    expect(screen.getByText('até 12:00 · Caravana')).toBeOnTheScreen();
  });

  it('RNF-07: day buttons say the date, the event count, today and the selection', async () => {
    await render(setup(date(15), [trip]).element(date(15)));

    expect(
      screen.getByRole('button', { name: '15 de novembro, 1 evento', selected: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Hoje, 13 de novembro, sem eventos' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '17 de novembro, sem eventos' })).toBeOnTheScreen();
  });

  it('RNF-08: the card names the unit, so the dots are not the only information', async () => {
    await render(setup(date(14), [trip]).element(date(14)));

    expect(screen.getByText('Criciúma 3')).toBeOnTheScreen();
    expect(screen.getByText('Capela Criciúma 3')).toBeOnTheScreen();
  });

  it('shows the summary of the selected day and its count', async () => {
    await render(setup(date(14), [trip]).element(date(14)));

    expect(screen.getByText('Sábado, 14 de novembro')).toBeOnTheScreen();
    expect(screen.getByText('1 evento')).toBeOnTheScreen();
  });

  it('RF-08: shows the empty message when the day has no events', async () => {
    await render(setup(date(20), [trip]).element(date(20)));

    expect(screen.getByText('0 evento')).toBeOnTheScreen();
    expect(screen.getByText('Nenhum evento neste dia com os filtros atuais.')).toBeOnTheScreen();
  });

  it('selects a day and opens an event', async () => {
    const { element, onSelect, onOpenEvent } = setup(date(14), [trip]);
    await render(element(date(14)));

    await fireEvent.press(screen.getByRole('button', { name: '17 de novembro, sem eventos' }));
    expect(onSelect).toHaveBeenCalledWith(date(17));

    await fireEvent.press(screen.getByRole('button', { name: /Caravana ao Templo/ }));
    expect(onOpenEvent).toHaveBeenCalledWith('trip');
  });
});
