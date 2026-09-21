import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * SecureStore on Android has a per-value limit of ~2KB. Supabase sessions can
 * exceed that, so we chunk the payload across multiple SecureStore keys.
 *
 * Layout:
 *   <key>          → single value when it fits, else absent
 *   <key>__count   → number of chunks (only when chunked)
 *   <key>__0..N    → individual chunks
 *
 * On web we fall back to AsyncStorage since SecureStore is native-only.
 */

const CHUNK_SIZE = 1800;

async function setChunked(key: string, value: string): Promise<void> {
  await clearChunks(key);

  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  const count = Math.ceil(value.length / CHUNK_SIZE);
  await SecureStore.setItemAsync(`${key}__count`, String(count));
  for (let i = 0; i < count; i++) {
    const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}__${i}`, chunk);
  }
}

async function getChunked(key: string): Promise<string | null> {
  const single = await SecureStore.getItemAsync(key);
  if (single != null) return single;

  const countStr = await SecureStore.getItemAsync(`${key}__count`);
  if (!countStr) return null;
  const count = parseInt(countStr, 10);
  if (Number.isNaN(count) || count <= 0) return null;

  let result = '';
  for (let i = 0; i < count; i++) {
    const chunk = await SecureStore.getItemAsync(`${key}__${i}`);
    if (chunk == null) return null;
    result += chunk;
  }
  return result;
}

async function clearChunks(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
  const countStr = await SecureStore.getItemAsync(`${key}__count`);
  if (countStr) {
    const count = parseInt(countStr, 10);
    await SecureStore.deleteItemAsync(`${key}__count`);
    if (!Number.isNaN(count) && count > 0) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}__${i}`);
      }
    }
  }
}

const nativeSecureStorage = {
  getItem: getChunked,
  setItem: setChunked,
  removeItem: clearChunks,
};

export const sessionStorage =
  Platform.OS === 'web' ? AsyncStorage : nativeSecureStorage;
