import { initials } from './initials';

describe('initials', () => {
  it.each([
    ['Maria da Silva', 'MS'],
    ['maria da silva', 'MS'],
    ['Ângela', 'Â'],
    [' joão  pedro ', 'JP'],
    ['', ''],
    ['   ', ''],
    ['João', 'J'],
    ['Ana Beatriz de Souza Lima', 'AL'],
  ])('CA-09: %j gives %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
