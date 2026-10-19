import { z } from 'zod';

import { createLlmClient } from '../client';
import type { LlmMessage, LlmProvider } from '../types';
import { extractJson, runTask, type LlmTask } from './task';

const echoTask: LlmTask<{ word: string }, { word: string; count: number }> = {
  name: 'echo',
  version: '3',
  system: 'Static instructions.',
  buildUser: ({ word }) => `Word: ${word}`,
  schema: z.object({ word: z.string(), count: z.number().int() }),
  maxTokens: 100,
  temperature: 0.3,
  check: (output, input) => (output.word === input.word ? null : `word must be "${input.word}"`),
};

function scriptedClient(replies: string[]) {
  const seen: LlmMessage[][] = [];
  const provider: LlmProvider = {
    api: 'fake',
    async complete(request) {
      seen.push(request.messages.map((m) => ({ ...m })));
      const text = replies.shift();
      if (text === undefined) throw new Error('no reply left');
      return {
        text,
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 1,
      };
    },
  };
  const client = createLlmClient({
    provider,
    providerId: 'openai',
    model: 'gpt-test',
    recorder: { record: () => undefined },
  });
  return { client, seen };
}

describe('runTask', () => {
  it('puts the static system prompt first and returns validated output', async () => {
    const { client, seen } = scriptedClient(['{"word":"Haus","count":2}']);
    const result = await runTask(client, echoTask, { word: 'Haus' });
    expect(result.output).toEqual({ word: 'Haus', count: 2 });
    expect(result.attempts).toBe(1);
    expect(result.promptVersion).toBe('echo@3');
    expect(seen[0]).toEqual([
      { role: 'system', content: 'Static instructions.' },
      { role: 'user', content: 'Word: Haus' },
    ]);
  });

  it('retries once with the validation error attached', async () => {
    const { client, seen } = scriptedClient(['{"word":"Haus"}', '{"word":"Haus","count":1}']);
    const result = await runTask(client, echoTask, { word: 'Haus' });
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    const retry = seen[1];
    expect(retry).toHaveLength(4);
    expect(retry[2]).toEqual({ role: 'assistant', content: '{"word":"Haus"}' });
    expect(retry[3].role).toBe('user');
    expect(retry[3].content).toContain('count');
  });

  it('runs the semantic check too', async () => {
    const { client, seen } = scriptedClient([
      '{"word":"Maus","count":1}',
      '{"word":"Haus","count":1}',
    ]);
    await runTask(client, echoTask, { word: 'Haus' });
    expect(seen[1][3].content).toContain('word must be "Haus"');
  });

  it('gives up after the retry so the caller can fall back to offline content', async () => {
    const { client } = scriptedClient(['not json', '{"word":1}']);
    await expect(runTask(client, echoTask, { word: 'Haus' })).rejects.toMatchObject({
      kind: 'invalid_output',
    });
  });

  it('accepts JSON wrapped in a code fence or prose', async () => {
    const { client } = scriptedClient(['Here you go:\n```json\n{"word":"Haus","count":3}\n```']);
    const result = await runTask(client, echoTask, { word: 'Haus' });
    expect(result.output.count).toBe(3);
  });
});

describe('extractJson', () => {
  it.each([
    ['{"a":1}', '{"a":1}'],
    ['```\n{"a":1}\n```', '{"a":1}'],
    ['Sure! {"a":{"b":2}} Hope that helps.', '{"a":{"b":2}}'],
    ['Result: [1,2]', '[1,2]'],
  ])('extracts %j', (input, expected) => {
    expect(extractJson(input)).toBe(expected);
  });
});
