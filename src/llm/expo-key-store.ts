import * as SecureStore from 'expo-secure-store';

import { keyStoreName, type KeyStore } from './key-store';

export const expoKeyStore: KeyStore = {
  get: (provider) => SecureStore.getItemAsync(keyStoreName(provider)),
  set: (provider, key) => SecureStore.setItemAsync(keyStoreName(provider), key.trim()),
  remove: (provider) => SecureStore.deleteItemAsync(keyStoreName(provider)),
};
