import { SETTING_DEFAULTS } from '@/core/settings';

import { createLlmClientFromSettings } from './factory';
import { completion, createFakeFetch } from './testing/fake-fetch';

const recorder = { record: () => undefined };

function settings(overrides: Partial<typeof SETTING_DEFAULTS> = {}) {
  return { ...SETTING_DEFAULTS, ...overrides };
}

describe('client from settings', () => {
  it('requires an API key', () => {
    expect(() =>
      createLlmClientFromSettings({ settings: settings(), apiKey: null, recorder }),
    ).toThrow(expect.objectContaining({ kind: 'no_key' }));
  });

  it('requires a base URL for a custom provider', () => {
    expect(() =>
      createLlmClientFromSettings({
        settings: settings({ 'llm.provider': 'custom', 'llm.model': 'm' }),
        apiKey: 'k',
        recorder,
      }),
    ).toThrow(expect.objectContaining({ kind: 'not_configured' }));
    expect(() =>
      createLlmClientFromSettings({
        settings: settings({
          'llm.provider': 'custom',
          'llm.model': 'm',
          'llm.customBaseUrl': 'localhost:8080',
        }),
        apiKey: 'k',
        recorder,
      }),
    ).toThrow(/http/);
  });

  it('requires a model when the provider has no suggestion', () => {
    expect(() =>
      createLlmClientFromSettings({
        settings: settings({ 'llm.provider': 'custom', 'llm.customBaseUrl': 'http://x/v1' }),
        apiKey: 'k',
        recorder,
      }),
    ).toThrow(expect.objectContaining({ kind: 'not_configured' }));
  });

  it("uses the preset's endpoint and suggested model when the model is empty", async () => {
    const fake = createFakeFetch([completion('OK')]);
    const client = createLlmClientFromSettings({
      settings: settings({ 'llm.provider': 'deepseek' }),
      apiKey: 'k',
      recorder,
      fetch: fake.fetch,
    });
    expect(client.model).toBe('deepseek-chat');
    expect(client.providerId).toBe('deepseek');
    await client.complete({ messages: [], maxTokens: 5 });
    expect(fake.calls[0].url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(fake.calls[0].body).toMatchObject({ model: 'deepseek-chat', max_tokens: 5 });
  });

  it('switching providers is only a settings change', async () => {
    const fake = createFakeFetch([completion('OK'), completion('OK')]);
    for (const provider of ['openai', 'openrouter'] as const) {
      await createLlmClientFromSettings({
        settings: settings({ 'llm.provider': provider, 'llm.model': 'some-model' }),
        apiKey: 'k',
        recorder,
        fetch: fake.fetch,
      }).complete({ messages: [], maxTokens: 5 });
    }
    expect(fake.calls.map((c) => c.url)).toEqual([
      'https://api.openai.com/v1/chat/completions',
      'https://openrouter.ai/api/v1/chat/completions',
    ]);
    expect(fake.calls[0].body).toHaveProperty('max_completion_tokens', 5);
    expect(fake.calls[1].body).toHaveProperty('max_tokens', 5);
  });
});
