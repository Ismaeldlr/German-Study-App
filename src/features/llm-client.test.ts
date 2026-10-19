/// <reference types="node" />
import { setSetting } from '@/data/repos/settings';
import { monthToDate, recentUsage } from '@/data/repos/usage';
import { createTestDb } from '@/data/testing/test-db';
import { createMemoryKeyStore } from '@/llm/key-store';
import { testConnection } from '@/llm/test-connection';

import { getLlmClient } from './llm-client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startMockLlmServer } = require('../../scripts/mock-llm-server.js') as {
  startMockLlmServer: (options: { port: number; host?: string; key?: string }) => Promise<{
    url: string;
    requests: Record<string, unknown>[];
    close: () => Promise<void>;
  }>;
};

/**
 * Phase 0 exit check: a test request round-trips over real HTTP and its
 * tokens show up in llm_usage.
 */
describe('Test connection round trip', () => {
  let server: Awaited<ReturnType<typeof startMockLlmServer>>;

  beforeAll(async () => {
    server = await startMockLlmServer({ port: 0, host: '127.0.0.1', key: 'test-key' });
  });
  afterAll(() => server.close());

  async function configuredServices(key = 'test-key') {
    const db = await createTestDb();
    setSetting(db, 'llm.provider', 'custom');
    setSetting(db, 'llm.customBaseUrl', `${server.url}/v1`);
    setSetting(db, 'llm.model', 'mock-mini');
    setSetting(db, 'llm.prices', { 'mock-mini': { input: 0.15, output: 0.6 } });
    const now = new Date(2026, 9, 19, 9);
    return { db, keyStore: createMemoryKeyStore({ custom: key }), now: () => now };
  }

  it('sends a tiny request and logs its tokens in llm_usage', async () => {
    const services = await configuredServices();
    const result = await testConnection(await getLlmClient(services));

    expect(result).toMatchObject({ ok: true, model: 'mock-mini', reply: 'OK' });
    const last = server.requests[server.requests.length - 1];
    expect(last).toMatchObject({ model: 'mock-mini', max_tokens: 16 });

    const rows = recentUsage(services.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      day: '2026-10-19',
      provider: 'custom',
      model: 'mock-mini',
      calls: 1,
    });
    if (!result.ok) throw new Error('unreachable');
    expect(rows[0].tokensIn).toBe(result.usage.inputTokens);
    expect(rows[0].tokensOut).toBe(result.usage.outputTokens);
    expect(rows[0].tokensIn).toBeGreaterThan(0);
    expect(rows[0].estimatedCost).toBeGreaterThan(0);
    expect(monthToDate(services.db, services.now()).calls).toBe(1);
  });

  it('reports a rejected key and logs nothing', async () => {
    const services = await configuredServices('wrong-key');
    const result = await testConnection(await getLlmClient(services));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/rejected the API key/);
    expect(recentUsage(services.db)).toHaveLength(0);
  });

  it('refuses to call once the monthly cap is reached', async () => {
    const services = await configuredServices();
    setSetting(services.db, 'llm.monthlyCap', 0);
    const before = server.requests.length;
    const result = await testConnection(await getLlmClient(services));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toMatch(/budget reached/);
    expect(server.requests.length).toBe(before);
  });

  it('reports an unreachable server', async () => {
    const services = await configuredServices();
    setSetting(services.db, 'llm.customBaseUrl', 'http://127.0.0.1:9/v1');
    const result = await testConnection(await getLlmClient(services));
    expect(result.ok).toBe(false);
  });
});
