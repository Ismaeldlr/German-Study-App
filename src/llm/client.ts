import type { ModelPrice } from '@/core/settings';

import { LlmError } from './errors';
import { approxTokens, estimateCost } from './pricing';
import type { BudgetGuard, LlmProvider, LlmRequest, LlmResponse, UsageRecorder } from './types';

export type ClientRequest = Omit<LlmRequest, 'model'> & { model?: string };

/**
 * The single entry point for LLM calls. It checks the budget before a call,
 * and logs tokens after every call that reached the provider, including ones
 * whose output later fails validation, since those tokens were still billed.
 */
export interface LlmClient {
  readonly providerId: string;
  readonly model: string;
  complete(request: ClientRequest): Promise<LlmResponse>;
}

export interface LlmClientOptions {
  provider: LlmProvider;
  providerId: string;
  model: string;
  recorder: UsageRecorder;
  budget?: BudgetGuard;
  priceFor?: (model: string) => ModelPrice | undefined;
  now?: () => Date;
}

export function createLlmClient(options: LlmClientOptions): LlmClient {
  const now = options.now ?? (() => new Date());

  return {
    providerId: options.providerId,
    model: options.model,
    async complete(request) {
      const model = request.model ?? options.model;

      if (options.budget) {
        const promptTokens = approxTokens(request.messages.map((m) => m.content).join('\n'));
        const worstCase = estimateCost(
          { inputTokens: promptTokens, outputTokens: request.maxTokens },
          options.priceFor?.(model),
        );
        const status = options.budget.check(worstCase);
        if (!status.allowed) {
          throw new LlmError(
            'budget',
            `Monthly LLM budget reached ($${status.spent.toFixed(2)} of $${status.cap.toFixed(2)}). Offline modes still work.`,
          );
        }
      }

      const response = await options.provider.complete({ ...request, model });
      options.recorder.record({
        provider: options.providerId,
        model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        at: now(),
      });
      return response;
    },
  };
}
