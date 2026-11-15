import { normalizeEmail, validateEmail } from './email';

const emailOfLength = (length: number) => `${'a'.repeat(length - '@x.co'.length)}@x.co`;

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ana@Exemplo.ORG ')).toBe('ana@exemplo.org');
  });
});

describe('validateEmail', () => {
  it('CA-03: empty or blank is required', () => {
    expect(validateEmail('')).toBe('required');
    expect(validateEmail('   ')).toBe('required');
  });

  it('CA-03: abc@ is invalid', () => {
    expect(validateEmail('abc@')).toBe('invalid');
    expect(validateEmail('abc')).toBe('invalid');
    expect(validateEmail('a b@x.co')).toBe('invalid');
    expect(validateEmail('@x.co')).toBe('invalid');
  });

  it('accepts uppercase and surrounding spaces', () => {
    expect(validateEmail('  Ana@Exemplo.org ')).toBeNull();
  });

  it('accepts 254 characters and rejects 255', () => {
    expect(validateEmail(emailOfLength(254))).toBeNull();
    expect(validateEmail(emailOfLength(255))).toBe('invalid');
  });
});
