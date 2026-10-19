import type { FetchLike } from '../types';

export type RecordedCall = { url: string; init: RequestInit; body: Record<string, unknown> };

type Reply =
  { status?: number; body: unknown } | ((call: RecordedCall) => { status?: number; body: unknown });

/** A fetch that answers from a queue of canned replies and records every call. */
export function createFakeFetch(replies: Reply[]) {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = {
      url,
      init,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    };
    calls.push(call);
    const next = queue.shift();
    if (!next) throw new Error('fake fetch: no reply queued');
    const reply = typeof next === 'function' ? next(call) : next;
    const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status ?? 200 });
  };
  return { fetch, calls };
}

export function completion(content: string, usage = { prompt_tokens: 12, completion_tokens: 3 }) {
  return {
    body: {
      id: 'chatcmpl-test',
      model: 'gpt-test-2026-01-01',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
    },
  };
}
