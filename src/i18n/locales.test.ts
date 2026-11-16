import { resources } from './index';
import { defaultLanguage, supportedLanguages } from './resolveLanguage';

// Arrays (e.g. calendar.weekdaysShort) are leaves, like strings.
type Tree = { [key: string]: string | string[] | Tree };

function keysOf(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' || Array.isArray(value)
      ? [`${prefix}${key}`]
      : keysOf(value, `${prefix}${key}.`),
  );
}

describe('locales', () => {
  const reference = keysOf(resources[defaultLanguage].translation).sort();

  it.each(supportedLanguages)('%s has exactly the same keys as pt-BR', (language) => {
    expect(keysOf(resources[language].translation).sort()).toEqual(reference);
  });

  it.each(supportedLanguages)('%s has no empty strings', (language) => {
    const tree = resources[language].translation as Tree;
    const empty = keysOf(tree).filter((key) => {
      const value = key
        .split('.')
        .reduce<string | string[] | Tree>((node, part) => (node as Tree)[part], tree);
      return typeof value === 'string' && value.trim() === '';
    });
    expect(empty).toEqual([]);
  });

  it.each(supportedLanguages)('%s has seven weekday initials', (language) => {
    const { calendar } = resources[language].translation;
    expect(calendar.weekdaysShort).toHaveLength(7);
  });
});
