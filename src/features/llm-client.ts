import { createBudgetGuard } from '@/data/repos/budget';
import { getAllSettings } from '@/data/repos/settings';
import { createUsageRecorder } from '@/data/repos/usage';
import type { LlmClient } from '@/llm/client';
import { createLlmClientFromSettings } from '@/llm/factory';

import type { Services } from './services';

/**
 * Build an LLM client from the current settings and saved key, wired to log
 * usage and respect the monthly cap. Throws an LlmError when not configured.
 */
export async function getLlmClient(services: Services): Promise<LlmClient> {
  const settings = getAllSettings(services.db);
  const apiKey = await services.keyStore.get(settings['llm.provider']);
  return createLlmClientFromSettings({
    settings,
    apiKey,
    recorder: createUsageRecorder(services.db),
    budget: createBudgetGuard(services.db, services.now),
    fetch: services.fetch,
    now: services.now,
  });
}
