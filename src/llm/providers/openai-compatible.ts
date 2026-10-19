import { LlmError } from '../errors';
import type { FetchLike, LlmProvider, LlmRequest, LlmResponse } from '../types';

/**
 * Adapter for the OpenAI chat completions API, which OpenAI, DeepSeek,
 * OpenRouter and many other providers speak.
 */

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  tokenLimitParam?: 'max_tokens' | 'max_completion_tokens';
  fetch?: FetchLike;
  defaultTimeoutMs?: number;
  now?: () => number;
}

type BodyOptions = {
  tokenLimitParam: 'max_tokens' | 'max_completion_tokens';
  sendTemperature: boolean;
  sendResponseFormat: boolean;
};

const DEFAULT_TIMEOUT_MS = 30_000;
// Each 400 can fix one unsupported parameter, so three covers all of them.
const MAX_PARAMETER_FIXES = 3;

export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  async function send(request: LlmRequest, body: BodyOptions): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      request.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const onAbort = () => controller.abort();
    if (request.signal?.aborted) controller.abort();
    request.signal?.addEventListener('abort', onAbort);

    try {
      return await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(buildBody(request, body)),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new LlmError('timeout', 'The request timed out.');
      if (request.signal?.aborted) throw new LlmError('aborted', 'The request was cancelled.');
      throw new LlmError('network', error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    api: 'openai-compatible',
    async complete(request) {
      const body: BodyOptions = {
        tokenLimitParam: options.tokenLimitParam ?? 'max_tokens',
        sendTemperature: request.temperature !== undefined,
        sendResponseFormat: request.json === true,
      };
      const started = now();

      for (let fixes = 0; ; fixes++) {
        const response = await send(request, body);
        const payload = await readJson(response);

        if (response.ok) return parseCompletion(payload, request.model, now() - started);

        const message = providerMessage(payload) ?? `HTTP ${response.status}`;
        if (
          response.status === 400 &&
          fixes < MAX_PARAMETER_FIXES &&
          fixParameters(body, message)
        ) {
          continue;
        }
        throw httpError(response.status, message);
      }
    },
  };
}

function buildBody(request: LlmRequest, options: BodyOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    [options.tokenLimitParam]: request.maxTokens,
  };
  if (options.sendTemperature) body.temperature = request.temperature;
  if (options.sendResponseFormat) body.response_format = { type: 'json_object' };
  return body;
}

/**
 * Providers disagree on optional parameters. When a 400 names one, adjust
 * it and try again instead of failing the call.
 */
function fixParameters(body: BodyOptions, message: string): boolean {
  const text = message.toLowerCase();
  if (body.tokenLimitParam === 'max_tokens' && text.includes('max_tokens')) {
    body.tokenLimitParam = 'max_completion_tokens';
    return true;
  }
  if (body.tokenLimitParam === 'max_completion_tokens' && text.includes('max_completion_tokens')) {
    body.tokenLimitParam = 'max_tokens';
    return true;
  }
  if (body.sendTemperature && text.includes('temperature')) {
    body.sendTemperature = false;
    return true;
  }
  if (
    body.sendResponseFormat &&
    (text.includes('response_format') || text.includes('json_object'))
  ) {
    body.sendResponseFormat = false;
    return true;
  }
  return false;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function providerMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload.slice(0, 300);
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
  }
  return undefined;
}

function httpError(status: number, message: string): LlmError {
  if (status === 401 || status === 403) return new LlmError('auth', message, status);
  if (status === 429) return new LlmError('rate_limit', message, status);
  if (status >= 500) return new LlmError('server', message, status);
  return new LlmError('bad_request', message, status);
}

function parseCompletion(payload: unknown, requestedModel: string, latencyMs: number): LlmResponse {
  if (!payload || typeof payload !== 'object') {
    throw new LlmError('bad_response', 'The provider returned an empty or non-JSON reply.');
  }
  const data = payload as {
    model?: unknown;
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const choice = data.choices?.[0];
  if (!choice) throw new LlmError('bad_response', 'The provider reply had no choices.');
  const content = choice.message?.content;

  return {
    text: typeof content === 'string' ? content : '',
    model: typeof data.model === 'string' && data.model ? data.model : requestedModel,
    usage: {
      inputTokens: toCount(data.usage?.prompt_tokens),
      outputTokens: toCount(data.usage?.completion_tokens),
    },
    latencyMs,
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
  };
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}
