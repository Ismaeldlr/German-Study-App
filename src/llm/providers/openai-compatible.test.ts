import { LlmError } from '../errors';
import { completion, createFakeFetch } from '../testing/fake-fetch';
import type { FetchLike, LlmRequest } from '../types';
import { createOpenAiCompatibleProvider } from './openai-compatible';

const request: LlmRequest = {
  model: 'gpt-test',
  messages: [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Hallo?' },
  ],
  maxTokens: 50,
};

function provider(fetch: FetchLike, tokenLimitParam?: 'max_tokens' | 'max_completion_tokens') {
  return createOpenAiCompatibleProvider({
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-test',
    tokenLimitParam,
    fetch,
  });
}

async function errorOf(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('OpenAI-compatible adapter', () => {
  it('posts a chat completion with the key and parses the reply and usage', async () => {
    const fake = createFakeFetch([completion('OK', { prompt_tokens: 20, completion_tokens: 2 })]);
    const response = await provider(fake.fetch).complete(request);

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.url).toBe('https://api.example.com/v1/chat/completions');
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(call.body).toEqual({ model: 'gpt-test', messages: request.messages, max_tokens: 50 });

    expect(response.text).toBe('OK');
    expect(response.model).toBe('gpt-test-2026-01-01');
    expect(response.usage).toEqual({ inputTokens: 20, outputTokens: 2 });
    expect(response.finishReason).toBe('stop');
  });

  it('sends JSON mode, temperature and the configured token parameter', async () => {
    const fake = createFakeFetch([completion('{}')]);
    await provider(fake.fetch, 'max_completion_tokens').complete({
      ...request,
      json: true,
      temperature: 0.4,
    });
    expect(fake.calls[0].body).toMatchObject({
      max_completion_tokens: 50,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    expect(fake.calls[0].body).not.toHaveProperty('max_tokens');
  });

  it('switches the token parameter when the provider rejects it', async () => {
    const fake = createFakeFetch([
      {
        status: 400,
        body: {
          error: {
            message:
              "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
          },
        },
      },
      completion('OK'),
    ]);
    const response = await provider(fake.fetch).complete(request);
    expect(response.text).toBe('OK');
    expect(fake.calls[1].body).toMatchObject({ max_completion_tokens: 50 });
    expect(fake.calls[1].body).not.toHaveProperty('max_tokens');
  });

  it('drops temperature and JSON mode when the provider rejects them', async () => {
    const fake = createFakeFetch([
      {
        status: 400,
        body: { error: { message: "Unsupported value: 'temperature' does not support 0.2" } },
      },
      {
        status: 400,
        body: { error: { message: "'response_format' of type 'json_object' is not supported" } },
      },
      completion('{"a":1}'),
    ]);
    await provider(fake.fetch).complete({ ...request, temperature: 0.2, json: true });
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[2].body).not.toHaveProperty('temperature');
    expect(fake.calls[2].body).not.toHaveProperty('response_format');
  });

  it('does not retry a 400 it cannot fix', async () => {
    const fake = createFakeFetch([
      { status: 400, body: { error: { message: 'model not found' } } },
    ]);
    const error = await errorOf(provider(fake.fetch).complete(request));
    expect(error.kind).toBe('bad_request');
    expect(error.message).toBe('model not found');
    expect(fake.calls).toHaveLength(1);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [500, 'server'],
    [503, 'server'],
    [404, 'bad_request'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const fake = createFakeFetch([{ status, body: { error: { message: 'nope' } } }]);
    const error = await errorOf(provider(fake.fetch).complete(request));
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it('reports network failures', async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    const error = await errorOf(provider(fetch).complete(request));
    expect(error.kind).toBe('network');
    expect(error.message).toBe('Network request failed');
  });

  it('times out slow providers', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const error = await errorOf(provider(fetch).complete({ ...request, timeoutMs: 20 }));
    expect(error.kind).toBe('timeout');
  });

  it('honours a caller abort', async () => {
    const controller = new AbortController();
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        controller.abort();
      });
    const error = await errorOf(
      provider(fetch).complete({ ...request, signal: controller.signal }),
    );
    expect(error.kind).toBe('aborted');
  });

  it('rejects replies without choices or with a non-JSON body', async () => {
    const empty = createFakeFetch([{ body: { choices: [] } }]);
    expect((await errorOf(provider(empty.fetch).complete(request))).kind).toBe('bad_response');
    const html = createFakeFetch([{ body: '<html>gateway</html>' }]);
    expect((await errorOf(provider(html.fetch).complete(request))).kind).toBe('bad_response');
  });

  it('treats missing usage as zero tokens and falls back to the requested model', async () => {
    const fake = createFakeFetch([{ body: { choices: [{ message: { content: 'hi' } }] } }]);
    const response = await provider(fake.fetch).complete(request);
    expect(response.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(response.model).toBe('gpt-test');
  });
});
