import { z } from 'zod';

import type { ChatScenario } from '@/core/chat';
import { SENTENCE_VERDICTS } from '@/core/translation';

import { CATEGORY_RULES, mistakeCategory } from './categories';
import type { LlmTask } from './task';

/**
 * One turn of a roleplay chat: check your message, then reply in
 * character. The model never sees the whole chat, only a rolling summary
 * and the latest exchanges, and it writes the summary anew every turn.
 */

export interface ChatTurnInput {
  scenario: ChatScenario;
  targets: { word: string; meaning: string }[];
  /** Everything before `recent`, in a few English sentences. */
  summary: string | null;
  recent: { from: 'learner' | 'you'; text: string }[];
  message: string;
  /** This message's number, and how many the chat runs to. */
  turn: number;
  turns: number;
}

const schema = z.object({
  correction: z.object({
    verdict: z.enum(SENTENCE_VERDICTS),
    corrected: z.string(),
    errors: z
      .array(
        z.object({
          category: mistakeCategory,
          text: z.string(),
          correction: z.string(),
          explanation: z.string(),
        }),
      )
      .optional()
      .default([]),
  }),
  used: z
    .array(z.object({ word: z.string(), verdict: z.enum(['correct', 'slip', 'wrong']) }))
    .optional()
    .default([]),
  reply: z.string().min(1),
  translation: z.string(),
  summary: z.string(),
});
export type ChatTurnOutput = z.infer<typeof schema>;

export const chatTurn: LlmTask<ChatTurnInput, ChatTurnOutput> = {
  name: 'chat_turn',
  version: '1',
  temperature: 0.6,
  schema,
  maxTokens: 700,
  system: `Task: chat_turn
You play a character in a roleplay chat with an A2 German learner whose class uses the Momente A2 textbook. You get the scenario, the learner's target words, a summary of the chat so far, the latest messages and the learner's new message. Check the learner's message, then reply in character.

Checking the learner's message:
- Accept any correct German. Judge grammar, word choice and spelling; ignore punctuation, and do not correct style when the German is fine.
- correction.verdict: "correct" when there are no errors, "minor" when the only errors are small slips (a missing umlaut, a lowercase noun, one wrong letter), "wrong" otherwise.
- correction.corrected: the learner's message with only the errors fixed, keeping their wording. The message itself when it is correct.
- correction.errors: every error, {"category", "text": the wrong part exactly as written, "correction": the fixed part, "explanation": one short English line}. An empty list when it is correct.
- used: for each target word the learner used in this message, in any form, {"word": the target exactly as given, "verdict": "correct", "slip" for a small slip, or "wrong" for a wrong form}. Leave out target words they did not use.
${CATEGORY_RULES}

Replying:
- reply: stay in character, in German at A2 level, one to three short sentences. React to what the learner said, then move the conversation on with a question.
- Steer toward the target words the learner has not used yet: ask questions whose natural answer needs them. Do not use those words yourself before the learner has.
- If the learner writes English or seems stuck, help in simple German and keep going.
- When turn equals turns, this is the last exchange: answer, then wrap the conversation up warmly without a new question.
- translation: your reply in English.
- summary: two or three English sentences on what has happened in the whole chat so far, this exchange included, so it can go on without the older messages.

Reply with only a JSON object: {"correction": {"verdict", "corrected", "errors": [{"category", "text", "correction", "explanation"}]}, "used": [{"word", "verdict"}], "reply", "translation", "summary"}`,
  buildUser: (input) =>
    JSON.stringify({
      scenario: input.scenario,
      targets: input.targets,
      summary: input.summary,
      recent: input.recent,
      turn: input.turn,
      turns: input.turns,
      message: input.message,
    }),
};
