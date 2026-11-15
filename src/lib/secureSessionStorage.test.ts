import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { SESSION_KEY_STORE_KEY, secureSessionStorage } from './secureSessionStorage';

// Reversible fake cipher: "sealed" data is the reversed, base64-encoded plaintext plus a marker.
// It is enough to prove the plaintext never reaches AsyncStorage and that failures are handled.
jest.mock('expo-crypto', () => {
  const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
  class Key {
    hex: string;
    constructor(hex: string) {
      this.hex = hex;
    }
    static async generate() {
      return new Key('ab'.repeat(32));
    }
    static async import(hex: string) {
      return new Key(hex);
    }
    async encoded() {
      return this.hex;
    }
  }
  class Sealed {
    b64: string;
    constructor(b64: string) {
      this.b64 = b64;
    }
    static fromCombined(b64: string) {
      return new Sealed(b64);
    }
    async combined() {
      return this.b64;
    }
  }
  return {
    AESKeySize: { AES256: 256 },
    AESEncryptionKey: Key,
    AESSealedData: Sealed,
    aesEncryptAsync: async (plain: Uint8Array, key: Key) =>
      new Sealed(toB64(Buffer.from(`${key.hex}|${Buffer.from(plain).toString('hex')}`))),
    aesDecryptAsync: async (sealed: Sealed, key: Key) => {
      const [hex, data] = Buffer.from(sealed.b64, 'base64').toString().split('|');
      if (hex !== key.hex || data === undefined) throw new Error('bad tag');
      return new Uint8Array(Buffer.from(data, 'hex'));
    },
  };
});

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl';
const SESSION = JSON.stringify({ access_token: JWT, refresh_token: 'refresh-secret' });

beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.deleteItemAsync(SESSION_KEY_STORE_KEY);
});

describe('secureSessionStorage', () => {
  it('CA-01: keeps no readable JWT in AsyncStorage and stores the key in SecureStore', async () => {
    await secureSessionStorage.setItem('sb-session', SESSION);

    const raw = await AsyncStorage.getItem('sb-session');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(JWT);
    expect(raw).not.toContain('refresh-secret');
    expect(Buffer.from(raw as string, 'base64').toString()).not.toContain(JWT);
    expect(await SecureStore.getItemAsync(SESSION_KEY_STORE_KEY)).toBeTruthy();
  });

  it('returns the original value after setItem', async () => {
    await secureSessionStorage.setItem('sb-session', SESSION);
    expect(await secureSessionStorage.getItem('sb-session')).toBe(SESSION);
  });

  it('reuses the same key across writes', async () => {
    await secureSessionStorage.setItem('a', 'one');
    await secureSessionStorage.setItem('b', 'two');
    expect(await secureSessionStorage.getItem('a')).toBe('one');
    expect(await secureSessionStorage.getItem('b')).toBe('two');
  });

  it('returns null for a missing item', async () => {
    expect(await secureSessionStorage.getItem('missing')).toBeNull();
  });

  it('removes the item and returns null when decryption fails', async () => {
    await secureSessionStorage.setItem('sb-session', SESSION);
    await SecureStore.setItemAsync(SESSION_KEY_STORE_KEY, 'cd'.repeat(32)); // key lost/replaced

    expect(await secureSessionStorage.getItem('sb-session')).toBeNull();
    expect(await AsyncStorage.getItem('sb-session')).toBeNull();
  });

  it('removeItem deletes the item', async () => {
    await secureSessionStorage.setItem('sb-session', SESSION);
    await secureSessionStorage.removeItem('sb-session');
    expect(await AsyncStorage.getItem('sb-session')).toBeNull();
  });
});
