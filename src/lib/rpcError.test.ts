import { rpcErrorCode } from './rpcError';

const known = ['forbidden', 'not_found'] as const;

describe('rpcErrorCode', () => {
  it('returns a known code from the message', () => {
    expect(rpcErrorCode({ message: 'not_found' }, known)).toBe('not_found');
  });

  it('maps a TypeError and fetch messages to network', () => {
    expect(rpcErrorCode(new TypeError('Network request failed'), known)).toBe('network');
    expect(rpcErrorCode({ message: 'Failed to fetch' }, known)).toBe('network');
  });

  it('maps anything else to unknown', () => {
    expect(rpcErrorCode({ message: 'boom' }, known)).toBe('unknown');
    expect(rpcErrorCode(null, known)).toBe('unknown');
  });
});
