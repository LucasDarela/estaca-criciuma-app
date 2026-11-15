import { privacyUrl } from './config';

const original = process.env.EXPO_PUBLIC_PRIVACY_URL;
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_PRIVACY_URL;
  else process.env.EXPO_PUBLIC_PRIVACY_URL = original;
});

describe('privacyUrl', () => {
  it('returns an https URL', () => {
    process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://exemplo.org/privacidade';
    expect(privacyUrl()).toBe('https://exemplo.org/privacidade');
  });

  it('returns null for http, other schemes, empty and missing values', () => {
    for (const value of ['http://exemplo.org', 'javascript:alert(1)', '', '   ']) {
      process.env.EXPO_PUBLIC_PRIVACY_URL = value;
      expect(privacyUrl()).toBeNull();
    }
    delete process.env.EXPO_PUBLIC_PRIVACY_URL;
    expect(privacyUrl()).toBeNull();
  });
});
