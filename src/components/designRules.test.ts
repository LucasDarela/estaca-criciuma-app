/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';

const componentsDir = __dirname;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// Tests may use literal sample data; the rules apply to shipped component code only.
const sources = walk(componentsDir).filter(
  (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
);

function offenders(pattern: RegExp): string[] {
  return sources.flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(new RegExp(pattern, 'g')) ?? [];
    return matches.map((match) => `${path.relative(componentsDir, file)}: ${match.trim()}`);
  });
}

describe('design system rules', () => {
  it('CA-20: no literal colors in components', () => {
    expect(offenders(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/)).toEqual([]);
  });

  it('CA-20: no literal UI text in components', () => {
    // Text between JSX tags that is not an expression ({...}). Props like label="..." are
    // caller-provided, so only element children are checked.
    expect(offenders(/(?<!=)>\s*[A-Za-zÀ-ÿ][^<{>]*</)).toEqual([]);
  });

  it('scans the component files (guards against a wrong path or filter)', () => {
    expect(sources.length).toBeGreaterThan(15);
  });
});
