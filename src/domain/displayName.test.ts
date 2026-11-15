import { validateDisplayName } from './displayName';

describe('validateDisplayName', () => {
  it('CA-09: empty or blank is required', () => {
    expect(validateDisplayName('')).toBe('required');
    expect(validateDisplayName('   ')).toBe('required');
  });

  it('1 character is too short, 2 is valid', () => {
    expect(validateDisplayName('A')).toBe('length');
    expect(validateDisplayName(' A ')).toBe('length');
    expect(validateDisplayName('Ana')).toBeNull();
    expect(validateDisplayName('Al')).toBeNull();
  });

  it('60 characters is valid, 61 is too long', () => {
    expect(validateDisplayName('a'.repeat(60))).toBeNull();
    expect(validateDisplayName('a'.repeat(61))).toBe('length');
  });
});
