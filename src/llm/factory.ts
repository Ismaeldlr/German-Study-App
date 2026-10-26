import type { SettingsValues } from '@/core/settings';

import { createLlmClient, type LlmClient } from './client';
import { LlmError } from './errors';
import { createOpenAiCompatibleProvider } from './providers/openai-compatible';
import { PROVIDER_PRESETS, resolveBaseUrl } from './providers/presets';
import type { BudgetGuard, FetchLike, UsageRecorder } from './types';

export interface ClientFromSettingsOptions {
  settings: Pick<SettingsValues, 'llm.provider' | 'llm.model' | 'llm.customBaseUrl' | 'llm.prices'>;
  apiKey: string | null;
  recorder: UsageRecorder;
  budget?: BudgetGuard;
  fetch?: FetchLike;
  /** The clock usage is logged by, the same one the budget reads. */
  now?: () => Date;
}

/** Build the client the settings describe. Switching providers is a settings change only. */
export function createLlmClientFromSettings(options: ClientFromSettingsOptions): LlmClient {
  const { settings } = options;
  const providerId = settings['llm.provider'];
  const preset = PROVIDER_PRESETS[providerId];
  const baseUrl = resolveBaseUrl(providerId, settings['llm.customBaseUrl']);
  const model = settings['llm.model'].trim() || preset.suggestedModel;

  if (!baseUrl) throw new LlmError('not_configured', 'Enter the base URL for your provider.');
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new LlmError('not_configured', 'The base URL must start with http:// or https://.');
  }
  if (!model) throw new LlmError('not_configured', 'Enter a model id.');
  if (!options.apiKey) throw new LlmError('no_key', 'No API key saved for this provider.');

  const prices = settings['llm.prices'];
  return createLlmClient({
    provider: createOpenAiCompatibleProvider({
      baseUrl,
      apiKey: options.apiKey,
      tokenLimitParam: preset.tokenLimitParam,
      fetch: options.fetch,
    }),
    providerId,
    model,
    recorder: options.recorder,
    budget: options.budget,
    priceFor: (m) => prices[m],
    now: options.now,
  });
}
