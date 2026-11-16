// The suite runs in a zone that is not America/Sao_Paulo so nothing can depend on the machine's
// zone (ADR 0005, RNF-04). Must be set before any test process reads the clock.
process.env.TZ = 'Europe/Lisbon';

const fs = require('node:fs');
const path = require('node:path');

// QA.md: 80% of lines in src/domain and src/lib. Jest errors on thresholds for paths with no
// files, so each one only applies once its folder exists.
const coverageThreshold = Object.fromEntries(
  ['src/domain', 'src/lib']
    .filter((dir) => fs.existsSync(path.join(__dirname, dir)))
    .map((dir) => [`./${dir}/`, { lines: 80 }]),
);

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/app/**/_layout.tsx',
    '!src/i18n/locales/**',
    '!src/lib/database.types.ts',
  ],
  coverageThreshold,
  // CI runners transform the module graph cold (no Babel cache), so the first test of a suite
  // that pulls in Modal/Animated can exceed Jest's 5 s default without anything hanging.
  testTimeout: 20000,
};
