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
  ],
  coverageThreshold,
};
