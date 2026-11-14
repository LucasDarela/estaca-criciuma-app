/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
// Built by concatenation so this file does not match itself.
const forbidden = new RegExp('service' + '_role', 'i');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('secrets', () => {
  it('CA-13: no service role key in src or public env vars', () => {
    const offenders = walk(path.join(root, 'src')).filter(
      (file) => file !== __filename && forbidden.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);

    const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const publicVars = example
      .split('\n')
      .map((line) => line.split('=')[0].trim())
      .filter((name) => name.startsWith('EXPO_PUBLIC_') && /SERVICE/i.test(name));
    expect(publicVars).toEqual([]);
  });
});
