// Tests run in pt-BR regardless of the machine's locale (QA.md).
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'pt-BR', languageCode: 'pt' }],
}));
