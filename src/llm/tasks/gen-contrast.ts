import { z } from 'zod';

import { CONTRAST_SIZE, drillProblem } from '@/core/drills';

import type { LlmTask } from './task';

/**
 * A contrast set for two words you mix up, such as stellen and stehen:
 * gap sentences where the answer is sometimes one word, sometimes the other.
 */

export interface GenContrastInput {
  words: { word: string; type: string; meaning: string }[];
  topic: string;
  /** Your wrong answers, so the set targets the actual mix-up. */
  mixups: string[];
}

const item = z.object({
  sentence: z.string(),
  hint: z.string(),
  answer: z.string(),
  accepted: z.array(z.string()).optional().default([]),
  translation: z.string(),
  explanation: z.string(),
  word: z.number().int(),
});

const schema = z.object({ explanation: z.string(), items: z.array(item) });
export type GenContrastOutput = z.infer<typeof schema>;

export const genContrast: LlmTask<GenContrastInput, GenContrastOutput> = {
  name: 'gen_contrast',
  version: '1',
  temperature: 0.7,
  schema,
  maxTokens: 1300,
  system: `Task: gen_contrast
You write a contrast exercise for an A2 German learner who mixes up two words. The learner's class uses the Momente A2 textbook.

Rules:
- explanation: one or two short English sentences on how to tell the two words apart.
- Write exactly ${CONTRAST_SIZE} items, half for each word, in a mixed order.
- word: 0 when the gap takes the first word, 1 when it takes the second.
- sentence: one natural German sentence of 5 to 14 words at A2 level, about the topic where it fits, with exactly "___" (three underscores) where the word goes, in whatever form the sentence needs. For a separable verb the gap holds the verb part only.
- hint: the English meaning of the missing word as used here, 1 to 4 words. Never the German word.
- answer: the exact text that fills the gap.
- accepted: other answers that are also correct in this gap. Usually none.
- translation: the whole sentence in English, gap filled.
- explanation (per item): one short English line on why this word fits here.
- Use only A1 and A2 vocabulary around the two words.

Reply with only a JSON object: {"explanation", "items": [{"word", "sentence", "hint", "answer", "accepted", "translation", "explanation"}]}`,
  buildUser: (input) => JSON.stringify(input),
  check(output, input) {
    const problem = drillProblem(output.items, CONTRAST_SIZE - 2);
    if (problem) return problem;
    if (!output.explanation.trim()) return 'explanation is empty';
    for (const [i] of input.words.entries()) {
      if (output.items.filter((item) => item.word === i).length < 2) {
        return `word ${i} needs at least 2 items`;
      }
    }
    const bad = output.items.findIndex((item) => item.word < 0 || item.word >= input.words.length);
    if (bad >= 0) return `item ${bad + 1} has word ${output.items[bad].word}`;
    return null;
  },
};
