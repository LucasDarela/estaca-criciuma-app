import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** Name of the AES key entry in the SecureStore. */
export const SESSION_KEY_STORE_KEY = 'estaca.session-key';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getKey(): Promise<AESEncryptionKey> {
  const stored = await SecureStore.getItemAsync(SESSION_KEY_STORE_KEY);
  if (stored) return AESEncryptionKey.import(stored, 'hex');
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(SESSION_KEY_STORE_KEY, await key.encoded('hex'));
  return key;
}

/**
 * `auth.storage` adapter for supabase-js (RNF-01). AsyncStorage holds the base64 of
 * `AESSealedData.combined()` (AES-256-GCM); the random key lives in the SecureStore (the session
 * is too large for the SecureStore itself). If `getItem` cannot decrypt (lost key, tampered data)
 * it removes the item and returns null: the person just signs in again.
 */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (stored === null) return null;
    try {
      const sealed = AESSealedData.fromCombined(stored);
      const bytes = await aesDecryptAsync(sealed, await getKey());
      return decoder.decode(bytes);
    } catch {
      await AsyncStorage.removeItem(key);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const sealed = await aesEncryptAsync(encoder.encode(value), await getKey());
    await AsyncStorage.setItem(key, await sealed.combined('base64'));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
