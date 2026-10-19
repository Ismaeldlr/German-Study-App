import { createFakeFetch } from './fake-fetch';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handlers } = require('../../../scripts/mock-tasks.js') as {
  handlers: { task: string; respond: (last: string, body: unknown) => string }[];
};

/**
 * A fetch that answers like scripts/mock-llm-server.js: canned task replies
 * by the "Task:" line of the system prompt, "OK" otherwise.
 */
export function createMockLlmFetch(count = 50) {
  const reply = (call: { body: Record<string, unknown> }) => {
    const messages = call.body.messages as { role: string; content: string }[];
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const handler = handlers.find((h) => system.includes(`Task: ${h.task}`));
    const content = handler ? handler.respond('', call.body) : 'OK';
    return {
      body: {
        model: call.body.model,
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: Math.ceil(content.length / 4) },
      },
    };
  };
  return createFakeFetch(Array.from({ length: count }, () => reply));
}
