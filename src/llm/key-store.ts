import type { ProviderId } from '@/core/settings';

/** Where API keys live. On the phone this is the OS keychain via expo-secure-store. */
export interface KeyStore {
  get(provider: ProviderId): Promise<string | null>;
  set(provider: ProviderId, key: string): Promise<void>;
  remove(provider: ProviderId): Promise<void>;
}

export function keyStoreName(provider: ProviderId): string {
  return `llm_api_key_${provider}`;
}

/** Show only the last four characters of a key. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

export function createMemoryKeyStore(initial: Partial<Record<ProviderId, string>> = {}): KeyStore {
  const keys = new Map<ProviderId, string>(Object.entries(initial) as [ProviderId, string][]);
  return {
    get: async (provider) => keys.get(provider) ?? null,
    set: async (provider, key) => {
      keys.set(provider, key);
    },
    remove: async (provider) => {
      keys.delete(provider);
    },
  };
}
