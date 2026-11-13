import { resolveLanguage } from './resolveLanguage';

describe('resolveLanguage', () => {
  it('returns the exact supported tag', () => {
    expect(resolveLanguage([{ languageTag: 'es-MX', languageCode: 'es' }])).toBe('es-MX');
  });

  it('maps another regional variant to the supported one of the same language', () => {
    expect(resolveLanguage([{ languageTag: 'en-GB', languageCode: 'en' }])).toBe('en-US');
    expect(resolveLanguage([{ languageTag: 'pt-PT', languageCode: 'pt' }])).toBe('pt-BR');
  });

  it('respects the order of device preferences', () => {
    expect(
      resolveLanguage([
        { languageTag: 'fr-FR', languageCode: 'fr' },
        { languageTag: 'es-AR', languageCode: 'es' },
      ]),
    ).toBe('es-MX');
  });

  it('falls back to pt-BR for unsupported or empty locales', () => {
    expect(resolveLanguage([{ languageTag: 'de-DE', languageCode: 'de' }])).toBe('pt-BR');
    expect(resolveLanguage([])).toBe('pt-BR');
  });
});
