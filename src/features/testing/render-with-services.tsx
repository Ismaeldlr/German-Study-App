import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createTestDb } from '@/data/testing/test-db';
import { createMemoryKeyStore } from '@/llm/key-store';

import { ServicesProvider, type Services } from '../services';

export async function createTestServices(overrides: Partial<Services> = {}): Promise<Services> {
  const now = new Date(2026, 9, 19, 9, 0);
  return {
    db: await createTestDb(),
    keyStore: createMemoryKeyStore(),
    now: () => now,
    ...overrides,
  };
}

/** Render a screen with the given services, or fresh test services. */
export async function renderWithServices(ui: ReactElement, services?: Services) {
  const resolved = services ?? (await createTestServices());
  await render(<ServicesProvider services={resolved}>{ui}</ServicesProvider>);
  return resolved;
}
