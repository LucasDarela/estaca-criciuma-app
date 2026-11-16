import { eventPushBody, postPushBody } from './pushContent';

describe('eventPushBody (server)', () => {
  const startsAt = new Date('2026-11-21T18:00:00Z'); // 15:00 in Sao Paulo

  it('CA-11: pt-BR body with weekday, date, time and place', () => {
    expect(eventPushBody(startsAt, 'Capela do Ramo Gaivota', 'pt-BR')).toBe(
      'Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota',
    );
  });

  it('CA-11: without a place the body ends at the time', () => {
    expect(eventPushBody(startsAt, '', 'pt-BR')).toBe('Sábado, 21 de novembro · 15:00');
  });

  it('CA-11: en-US and es-MX start with a capital letter', () => {
    expect(eventPushBody(startsAt, 'Chapel', 'en-US')).toBe(
      'Saturday, November 21 · 15:00 · Chapel',
    );
    expect(eventPushBody(startsAt, 'Capilla', 'es-MX')).toMatch(/^Sábado, 21 de noviembre · 15:00/);
  });

  it('uses the Sao Paulo day near midnight', () => {
    expect(eventPushBody(new Date('2026-11-22T02:30:00Z'), '', 'pt-BR')).toBe(
      'Sábado, 21 de novembro · 23:30',
    );
  });
});

describe('postPushBody', () => {
  it('takes the first non-empty line, trimmed', () => {
    expect(postPushBody('\n  \n  Primeira linha  \nSegunda')).toBe('Primeira linha');
  });

  it('keeps 120 characters as they are', () => {
    const text = 'a'.repeat(120);
    expect(postPushBody(text)).toBe(text);
  });

  it('cuts longer lines with an ellipsis as the 120th character', () => {
    const body = postPushBody('b'.repeat(200));
    expect(Array.from(body)).toHaveLength(120);
    expect(body.endsWith('…')).toBe(true);
  });

  it('an empty text gives an empty body', () => {
    expect(postPushBody('  \n ')).toBe('');
  });
});
