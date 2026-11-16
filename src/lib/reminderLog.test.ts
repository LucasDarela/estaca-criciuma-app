import AsyncStorage from '@react-native-async-storage/async-storage';

import { addReminder, readReminderLog, removeReminders } from './reminderLog';

// Reversible fake cipher (same idea as secureSessionStorage.test.ts): enough to prove the
// plaintext never reaches AsyncStorage.
jest.mock('expo-crypto', () => {
  class Key {
    static async generate() {
      return new Key();
    }
    static async import() {
      return new Key();
    }
    async encoded() {
      return 'ab'.repeat(32);
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
    aesEncryptAsync: async (plain: Uint8Array) =>
      new Sealed(Buffer.from(Buffer.from(plain).toString('hex')).toString('base64')),
    aesDecryptAsync: async (sealed: Sealed) =>
      new Uint8Array(Buffer.from(Buffer.from(sealed.b64, 'base64').toString(), 'hex')),
  };
});

const entry = { noteId: 'n1', title: 'Ligar para o bispo', fireAt: '2026-11-14T12:00:00.000Z' };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('reminderLog', () => {
  it('starts empty', async () => {
    expect(await readReminderLog()).toEqual([]);
  });

  it('stores the log encrypted: the raw value does not contain the title', async () => {
    await addReminder(entry);
    const raw = await AsyncStorage.getItem('reminderLog.v1');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('Ligar para o bispo');
    expect(await readReminderLog()).toEqual([entry]);
  });

  it('keeps the same note and fire time once', async () => {
    await addReminder(entry);
    await addReminder(entry);
    await addReminder({ ...entry, fireAt: '2026-11-15T12:00:00.000Z' });
    expect(await readReminderLog()).toHaveLength(2);
  });

  it('removeReminders drops every entry of the note', async () => {
    await addReminder(entry);
    await addReminder({ ...entry, fireAt: '2026-11-15T12:00:00.000Z' });
    await addReminder({ noteId: 'n2', title: 'Outra', fireAt: '2026-11-15T12:00:00.000Z' });
    await removeReminders('n1');
    expect((await readReminderLog()).map((e) => e.noteId)).toEqual(['n2']);
  });

  it('invalid JSON is an empty log', async () => {
    const { secureSessionStorage } = jest.requireActual('./secureSessionStorage');
    await secureSessionStorage.setItem('reminderLog.v1', '{not json');
    expect(await readReminderLog()).toEqual([]);
  });

  it('drops malformed entries and a non-array value', async () => {
    const { secureSessionStorage } = jest.requireActual('./secureSessionStorage');
    await secureSessionStorage.setItem(
      'reminderLog.v1',
      JSON.stringify([entry, { noteId: 1 }, { noteId: 'x', title: 't', fireAt: 'not a date' }]),
    );
    expect(await readReminderLog()).toEqual([entry]);
    await secureSessionStorage.setItem('reminderLog.v1', JSON.stringify({ a: 1 }));
    expect(await readReminderLog()).toEqual([]);
  });
});
