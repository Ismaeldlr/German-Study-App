import { z } from 'zod';

import type { LlmTask } from './task';

/** Set up a roleplay scenario for the topic and open it in character. */

export interface ChatOpenInput {
  topic: string;
  /** The deck words the chat should lead you to use. */
  targets: { word: string; meaning: string }[];
}

const schema = z.object({
  title: z.string().min(1),
  character: z.string().min(1),
  situation: z.string().min(1),
  reply: z.string().min(1),
  translation: z.string(),
});
export type ChatOpenOutput = z.infer<typeof schema>;

export const chatOpen: LlmTask<ChatOpenInput, ChatOpenOutput> = {
  name: 'chat_open',
  version: '1',
  temperature: 0.9,
  schema,
  maxTokens: 300,
  system: `Task: chat_open
You set up a roleplay chat for an A2 German learner whose class uses the Momente A2 textbook, and open it in character.

Rules:
- Invent an everyday scenario that fits the topic and in which the learner naturally needs the target words: viewing a flat, ordering food, asking a neighbour for help. The learner plays themselves.
- title: a short German title for the scenario.
- character: who you play, in English, with a German name: "Frau Becker, the landlord".
- situation: one or two English sentences telling the learner who they are and what they want. Do not give away the target words in German.
- reply: your first message in character, in German at A2 level: one to three short sentences ending with a question the learner can answer.
- translation: the reply in English.

Reply with only a JSON object: {"title", "character", "situation", "reply", "translation"}`,
  buildUser: (input) => JSON.stringify({ topic: input.topic, targets: input.targets }),
};
