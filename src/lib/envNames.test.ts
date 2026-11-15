/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

function walk(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return [target];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => walk(path.join(target, entry.name)));
}

// Built from parts so this file does not contain the old name itself.
const OLD_NAME = ['SUPABASE', 'ANON', 'KEY'].join('_');
const NEW_NAME = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

const files = ['src', '.env.example', '.ai/docs', 'docs', 'README.md', 'AGENTS.md'].flatMap((p) =>
  walk(path.join(root, p)),
);

describe('environment variable names', () => {
  it('CA-08: no file in src, docs or .env.example mentions the old anon key name', () => {
    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes(OLD_NAME));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it('scans the expected files (guards against a wrong path)', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('CA-08: the client reads the publishable key variable', () => {
    const source = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8');
    expect(source).toContain(NEW_NAME);
  });
});
