import { z } from 'zod';

import type { LlmTask } from './task';

/**
 * Help for a leech: a card you keep forgetting. A memory hook, and the
 * word it is most likely confused with, for a contrast set.
 */

export interface LeechHelpInput {
  word: string;
  type: string;
  meanings: string[];
  /** Forms worth remembering, as one line: "Pl. die Wohnungen". */
  forms: string | null;
  /** What you answered when you got it wrong. */
  wrongAnswers: string[];
  /** A deck word your answers show you confuse it with, if any. */
  confusedWith: string | null;
}

const schema = z.object({
  hook: z.string(),
  partner: z.object({ word: z.string(), meaning: z.string() }).nullable().optional().default(null),
});
export type LeechHelpOutput = z.infer<typeof schema>;

export const leechHelp: LlmTask<LeechHelpInput, LeechHelpOutput> = {
  name: 'leech_help',
  version: '1',
  temperature: 0.8,
  schema,
  maxTokens: 300,
  system: `Task: leech_help
An A2 German learner keeps forgetting one word. Help them remember it.

Rules:
- hook: a memory hook in English, 1 or 2 short sentences: a vivid image, a sound-alike, or a link to English or another German word. Include the article for nouns and the tricky form when that is what they get wrong (look at their wrong answers).
- partner: the German word they most likely confuse it with, {"word": as written on a card, with the article for nouns, "meaning": its English meaning}. Use confusedWith when it is given. null when there is no likely confusion.

Reply with only a JSON object: {"hook", "partner"}`,
  buildUser: (input) => JSON.stringify(input),
  check: (output) => (output.hook.trim() ? null : 'hook is empty'),
};
