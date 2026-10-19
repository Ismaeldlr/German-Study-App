import type { LlmClient } from './client';
import { describeLlmError } from './errors';
import type { TokenCounts } from './types';

export type ConnectionResult =
  | {
      ok: true;
      model: string;
      reply: string;
      latencyMs: number;
      usage: TokenCounts;
    }
  | { ok: false; error: string };

/** Send one tiny request. Its tokens are logged like any other call. */
export async function testConnection(client: LlmClient): Promise<ConnectionResult> {
  try {
    const response = await client.complete({
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: 16,
      timeoutMs: 20_000,
    });
    return {
      ok: true,
      model: response.model,
      reply: response.text.trim(),
      latencyMs: response.latencyMs,
      usage: response.usage,
    };
  } catch (error) {
    return { ok: false, error: describeLlmError(error) };
  }
}
