import { z } from 'zod';

import type { ChatScenario } from '@/core/chat';

import type { LlmTask } from './task';

/**
 * A teacher's look back over a finished chat. The mistakes themselves come
 * from each turn's check and are already logged; this adds what went well
 * and the one pattern most worth working on.
 */

export interface ChatSummaryInput {
  scenario: ChatScenario;
  targets: string[];
  /** Your messages, each with the corrections it got. */
  messages: { text: string; corrected: string; errors: string[] }[];
}

const schema = z.object({
  feedback: z.string().min(1),
  wellUsed: z.array(z.string()).optional().default([]),
});
export type ChatSummaryOutput = z.infer<typeof schema>;

export const chatSummary: LlmTask<ChatSummaryInput, ChatSummaryOutput> = {
  name: 'chat_summary',
  version: '1',
  temperature: 0.4,
  schema,
  maxTokens: 400,
  system: `Task: chat_summary
You are a friendly German teacher looking back over a roleplay chat an A2 learner just had. The learner's class uses the Momente A2 textbook. You get the scenario, the learner's target words, and their messages with the corrections each got.

Rules:
- feedback: two to four short English sentences. First what went well, then the one pattern in their mistakes most worth working on, with a short German example of the right form. With no mistakes, suggest what to try next time.
- wellUsed: up to five German words or phrases the learner used correctly that are worth being proud of at A2, exactly as they wrote them.

Reply with only a JSON object: {"feedback", "wellUsed"}`,
  buildUser: (input) =>
    JSON.stringify({
      scenario: input.scenario,
      targets: input.targets,
      messages: input.messages,
    }),
};
