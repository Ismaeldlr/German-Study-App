import { createLlmClient } from './client';
import { LlmError } from './errors';
import type { BudgetGuard, LlmProvider, UsageEntry } from './types';

function fakeProvider(text = 'OK') {
  const requests: unknown[] = [];
  const provider: LlmProvider = {
    api: 'fake',
    async complete(request) {
      requests.push(request);
      return {
        text,
        model: `${request.model}-2026`,
        usage: { inputTokens: 40, outputTokens: 8 },
        latencyMs: 5,
      };
    },
  };
  return { provider, requests };
}

describe('LLM client', () => {
  it('logs the tokens of every call under the configured model name', async () => {
    const { provider } = fakeProvider();
    const logged: UsageEntry[] = [];
    const at = new Date(2026, 9, 19);
    const client = createLlmClient({
      provider,
      providerId: 'openai',
      model: 'gpt-test',
      recorder: { record: (e) => logged.push(e) },
      now: () => at,
    });
    await client.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 });
    expect(logged).toEqual([
      { provider: 'openai', model: 'gpt-test', inputTokens: 40, outputTokens: 8, at },
    ]);
  });

  it('lets a request override the model, for per-task models', async () => {
    const { provider, requests } = fakeProvider();
    const logged: UsageEntry[] = [];
    const client = createLlmClient({
      provider,
      providerId: 'openai',
      model: 'cheap',
      recorder: { record: (e) => logged.push(e) },
    });
    await client.complete({ model: 'strong', messages: [], maxTokens: 10 });
    expect(requests[0]).toMatchObject({ model: 'strong' });
    expect(logged[0].model).toBe('strong');
  });

  it('checks the budget with a worst-case estimate and blocks before calling', async () => {
    const { provider, requests } = fakeProvider();
    const estimates: number[] = [];
    const budget: BudgetGuard = {
      check(estimated) {
        estimates.push(estimated);
        return { allowed: false, spent: 2, cap: 2 };
      },
    };
    const client = createLlmClient({
      provider,
      providerId: 'openai',
      model: 'gpt-test',
      recorder: { record: () => undefined },
      budget,
      priceFor: () => ({ input: 1, output: 4 }),
    });
    const call = client.complete({
      messages: [{ role: 'user', content: 'x'.repeat(4000) }],
      maxTokens: 1000,
    });
    await expect(call).rejects.toMatchObject({ kind: 'budget' });
    await expect(call).rejects.toBeInstanceOf(LlmError);
    expect(requests).toHaveLength(0);
    // 1000 prompt tokens at $1/M plus 1000 output tokens at $4/M.
    expect(estimates[0]).toBeCloseTo(0.005, 10);
  });

  it('does not log anything when the provider call fails', async () => {
    const logged: UsageEntry[] = [];
    const client = createLlmClient({
      provider: {
        api: 'fake',
        complete: () => Promise.reject(new LlmError('server', 'down', 500)),
      },
      providerId: 'openai',
      model: 'gpt-test',
      recorder: { record: (e) => logged.push(e) },
    });
    await expect(client.complete({ messages: [], maxTokens: 1 })).rejects.toMatchObject({
      kind: 'server',
    });
    expect(logged).toHaveLength(0);
  });
});
