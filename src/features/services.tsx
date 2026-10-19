import { createContext, useContext, type ReactNode } from 'react';

import type { Db } from '@/data/db';
import type { KeyStore } from '@/llm/key-store';
import type { FetchLike } from '@/llm/types';

/**
 * Everything a screen needs from the outside world. The app passes the real
 * SQLite database and secure store; tests pass sql.js and an in-memory store.
 */
export interface Services {
  db: Db;
  keyStore: KeyStore;
  fetch?: FetchLike;
  now: () => Date;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}
