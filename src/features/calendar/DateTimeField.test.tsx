import { render, screen, userEvent } from '@testing-library/react-native';

import { formatCivil } from '@/domain/time';
import i18n from '@/i18n';

import { DateTimeField } from './DateTimeField';
import { useDateTimePicker } from './useDateTimePicker';

jest.mock('./useDateTimePicker');

const open = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (useDateTimePicker as jest.Mock).mockReturnValue({ open, element: null });
});

const date = { year: 2026, month: 11, day: 13 };
const time = { hour: 19, minute: 30 };

function renderField(overrides: Partial<React.ComponentProps<typeof DateTimeField>> = {}) {
  const onChangeDate = jest.fn();
  const onChangeTime = jest.fn();
  const element = (
    <DateTimeField
      label="Início"
      date={date}
      time={time}
      showDate
      onChangeDate={onChangeDate}
      onChangeTime={onChangeTime}
      {...overrides}
    />
  );
  return { element, onChangeDate, onChangeTime };
}

describe('DateTimeField', () => {
  it('RNF-08: announces the label with the long date', async () => {
    const { element } = renderField();
    await render(element);
    const long = formatCivil(date, i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    expect(screen.getByRole('button', { name: `Início, ${long}` })).toBeOnTheScreen();
  });

  it('RNF-08: announces the label with the 24 h time', async () => {
    const { element } = renderField();
    await render(element);
    expect(screen.getByRole('button', { name: 'Início, 19:30' })).toBeOnTheScreen();
    expect(screen.getByText('19:30')).toBeOnTheScreen();
  });

  it('RF-04: hides the date button when showDate is false', async () => {
    const { element } = renderField({ showDate: false, label: 'Fim' });
    await render(element);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Fim, 19:30' })).toBeOnTheScreen();
  });

  it('CA-20: a picked date comes back as the Sao Paulo civil date, not the device one', async () => {
    const user = userEvent.setup();
    const { element, onChangeDate } = renderField();
    await render(element);
    await user.press(screen.getAllByRole('button')[0]);
    expect(open).toHaveBeenCalledWith(
      'date',
      new Date('2026-11-13T22:30:00Z'),
      expect.any(Function),
      'Início',
    );
    // 02:30Z on the 14th is 23:30 on the 13th in Sao Paulo (the suite runs in Europe/Lisbon).
    open.mock.calls[0][2](new Date('2026-11-14T02:30:00Z'));
    expect(onChangeDate).toHaveBeenCalledWith({ year: 2026, month: 11, day: 13 });
  });

  it('CA-20: a picked time comes back as the Sao Paulo wall time', async () => {
    const user = userEvent.setup();
    const { element, onChangeTime } = renderField();
    await render(element);
    await user.press(screen.getByRole('button', { name: 'Início, 19:30' }));
    open.mock.calls[0][2](new Date('2026-11-13T22:45:00Z'));
    expect(onChangeTime).toHaveBeenCalledWith({ hour: 19, minute: 45 });
  });

  it('shows the error under the field', async () => {
    const { element } = renderField({ error: 'O fim precisa ser depois do início.' });
    await render(element);
    expect(screen.getByText('O fim precisa ser depois do início.')).toBeOnTheScreen();
  });
});
