import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CalendarEvent } from '@/domain/calendar';
import type { CivilDate } from '@/domain/time';
import { size } from '@/theme/theme';
import { makeEvent } from '@/test/factories';

import { DayView } from './DayView';

const today = { year: 2026, month: 11, day: 13 };
// 12:00 in Sao Paulo
const now = new Date('2026-11-13T15:00:00Z');

const early = makeEvent({
  id: 'early',
  title: 'Reunião matinal',
  unitId: 'criciuma1',
  type: 'meeting',
  startsAt: new Date('2026-11-13T08:00:00Z'), // 05:00
  endsAt: new Date('2026-11-13T10:00:00Z'), // 07:00
});
const afternoon = makeEvent({
  id: 'afternoon',
  title: 'Serviço comunitário',
  unitId: 'icara',
  startsAt: new Date('2026-11-13T18:00:00Z'), // 15:00
  endsAt: new Date('2026-11-13T20:00:00Z'), // 17:00
});

function setup(events: CalendarEvent[], selected: CivilDate = today) {
  const onSelect = jest.fn();
  const onOpenEvent = jest.fn();
  const element = (
    <DayView
      selected={selected}
      today={today}
      now={now}
      events={events}
      locale="pt-BR"
      onSelect={onSelect}
      onOpenEvent={onOpenEvent}
    />
  );
  return { element, onSelect, onOpenEvent };
}

describe('DayView', () => {
  it('CA-11: an event from 05:00 to 07:00 starts on the 06:00 line', async () => {
    await render(setup([early]).element);

    const block = screen.getByRole('button', {
      name: 'Reunião matinal, 05:00 a 07:00, Criciúma 1',
    });
    expect(block).toHaveStyle({ top: 0, height: size.dayHourHeight });
  });

  it('positions an event inside the window relative to 06:00', async () => {
    await render(setup([afternoon]).element);

    const block = screen.getByRole('button', {
      name: 'Serviço comunitário, 15:00 a 17:00, Içara',
    });
    expect(block).toHaveStyle({ top: 9 * size.dayHourHeight, height: 2 * size.dayHourHeight });
  });

  it('RNF-10: blocks are buttons labelled with title, times and unit, and open the detail', async () => {
    const { element, onOpenEvent } = setup([afternoon]);
    await render(element);

    await fireEvent.press(
      screen.getByRole('button', { name: /^Serviço comunitário, 15:00 a 17:00/ }),
    );

    expect(onOpenEvent).toHaveBeenCalledWith('afternoon');
  });

  it('shows the block title and the "{start}–{end} · {unit}" line', async () => {
    await render(setup([afternoon]).element);

    expect(screen.getByText('15:00–17:00 · Içara')).toBeOnTheScreen();
  });

  it('RF-10: draws the "now" line on today only', async () => {
    const view = await render(setup([afternoon]).element);
    const line = screen.getByTestId('now-line');
    // 12:00 is 6 h after the 06:00 start of the window
    expect(line).toHaveStyle({ top: 6 * size.dayHourHeight });

    const other = setup(
      [
        makeEvent({
          startsAt: new Date('2026-11-14T18:00:00Z'),
          endsAt: new Date('2026-11-14T20:00:00Z'),
        }),
      ],
      { year: 2026, month: 11, day: 14 },
    );
    await view.rerender(other.element);
    expect(screen.queryByTestId('now-line')).not.toBeOnTheScreen();
  });

  it('shows the empty message when the day has no events', async () => {
    await render(setup([]).element);

    expect(screen.getByText('Nenhum evento neste dia')).toBeOnTheScreen();
    expect(screen.queryByTestId('now-line')).not.toBeOnTheScreen();
  });

  it('lists the hours of the window from 06:00 to 22:00', async () => {
    await render(setup([afternoon]).element);

    expect(screen.getByText('06:00')).toBeOnTheScreen();
    expect(screen.getByText('22:00')).toBeOnTheScreen();
  });
});
