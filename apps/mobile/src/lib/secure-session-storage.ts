import * as SecureStore from 'expo-secure-store';

export interface SecureStoreBoundary {
  getItemAsync(
    key: string,
    options?: SecureStore.SecureStoreOptions,
  ): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options?: SecureStore.SecureStoreOptions,
  ): Promise<void>;
  deleteItemAsync(
    key: string,
    options?: SecureStore.SecureStoreOptions,
  ): Promise<void>;
}

export interface AuthSessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const options: SecureStore.SecureStoreOptions = {
  keychainService: 'jpkrlove.auth',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export function createSecureSessionStorage(
  secureStore: SecureStoreBoundary = SecureStore,
): AuthSessionStorage {
  return {
    getItem: (key) => secureStore.getItemAsync(key, options),
    setItem: (key, value) => secureStore.setItemAsync(key, value, options),
    removeItem: (key) => secureStore.deleteItemAsync(key, options),
  };
}
