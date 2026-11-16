import {
  digitsFromE164,
  formatPhone,
  isValidPhoneDigits,
  maskPhone,
  phoneDigits,
  phoneSpeech,
  telUrl,
  toE164,
  whatsappUrl,
} from './phone';

describe('phoneDigits', () => {
  it('[leadership] keeps only digits, at most 11', () => {
    expect(phoneDigits('(48) 99999-0000')).toBe('48999990000');
    expect(phoneDigits('4899999000099')).toBe('48999990000');
    expect(phoneDigits('abc')).toBe('');
  });
});

describe('maskPhone', () => {
  it('[leadership] masks progressively', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone('4')).toBe('(4');
    expect(maskPhone('48')).toBe('(48');
    expect(maskPhone('4899')).toBe('(48) 99');
    expect(maskPhone('48999990')).toBe('(48) 9999-90');
  });

  it('[leadership] masks 10 and 11 digits', () => {
    expect(maskPhone('4833330000')).toBe('(48) 3333-0000');
    expect(maskPhone('48999990000')).toBe('(48) 99999-0000');
  });
});

describe('isValidPhoneDigits', () => {
  it('[leadership] CA-25: accepts 10 and 11 digits with a valid area code', () => {
    expect(isValidPhoneDigits('4833330000')).toBe(true);
    expect(isValidPhoneDigits('48999990000')).toBe(true);
  });

  it('[leadership] CA-25: rejects 9 and 12 digits and an area code starting with 0', () => {
    expect(isValidPhoneDigits('489999900')).toBe(false);
    expect(isValidPhoneDigits('489999900001')).toBe(false);
    expect(isValidPhoneDigits('04999990000')).toBe(false);
    expect(isValidPhoneDigits('4899999')).toBe(false);
  });
});

describe('E.164', () => {
  it('[leadership] converts both ways', () => {
    expect(toE164('48999990000')).toBe('+5548999990000');
    expect(digitsFromE164('+5548999990000')).toBe('48999990000');
  });

  it('[leadership] formats a mobile and a landline', () => {
    expect(formatPhone('+5548999990000')).toBe('(48) 99999-0000');
    expect(formatPhone('+554833330000')).toBe('(48) 3333-0000');
  });

  it('[leadership] RNF-12: speaks the digits in groups', () => {
    expect(phoneSpeech('+5548999990000')).toBe('4 8, 9 9 9 9 9, 0 0 0 0');
    expect(phoneSpeech('+554833330000')).toBe('4 8, 3 3 3 3, 0 0 0 0');
  });
});

describe('links', () => {
  it('[leadership] CA-20: builds tel: and wa.me URLs', () => {
    expect(telUrl('+5548999990000')).toBe('tel:+5548999990000');
    expect(whatsappUrl('+5548999990000')).toBe('https://wa.me/5548999990000');
  });

  it('[leadership] CA-22: no WhatsApp for a landline', () => {
    expect(whatsappUrl('+554833330000')).toBeNull();
  });
});
