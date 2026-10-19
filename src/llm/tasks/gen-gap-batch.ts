import { z } from 'zod';

import type { LlmTask } from './task';

/**
 * Ten gap sentences per call. Each bundle names one target word, a few
 * support words and a topic. Whether each sentence really uses the target
 * is checked per item afterwards, so one weak sentence does not cost a
 * retry of the whole batch.
 */

export interface GapBundleInput {
  id: number;
  /** As written on a card: "die Wohnung", "umziehen". */
  word: string;
  type: string;
  meaning: string;
  support: string[];
  topic: string;
}

export interface GenGapInput {
  bundles: GapBundleInput[];
}

const item = z.object({
  id: z.number().int(),
  sentence: z.string(),
  answer: z.string(),
  accepted: z.array(z.string()).optional().default([]),
  cue: z.string(),
  translation: z.string(),
  glosses: z
    .array(z.object({ de: z.string(), en: z.string() }))
    .optional()
    .default([]),
});

const schema = z.object({ items: z.array(item) });
export type GenGapOutput = z.infer<typeof schema>;
export type GenGapItem = z.infer<typeof item>;

export const genGapBatch: LlmTask<GenGapInput, GenGapOutput> = {
  name: 'gen_gap_batch',
  version: '1',
  temperature: 0.8,
  schema,
  maxTokens: (input) => 150 + 140 * input.bundles.length,
  system: `Task: gen_gap_batch
You write practice sentences for an A2 German learner whose class uses the Momente A2 textbook. For each bundle, write one sentence with a gap where the target word goes.

Rules:
- Every bundle has an id. Return exactly one item per id, in the same order.
- sentence: one natural German sentence of 6 to 16 words at A2 level, about the bundle's topic. Write the target word once and replace it with exactly "___" (three underscores).
- Put the target in whatever form the sentence needs: a plural, a case ending, a conjugated or past form, an adjective ending. That form is what the learner practises.
- The gap holds only the target word: never its article, never a second word. For a separable verb the gap holds the verb part and the prefix stays at the end of the clause ("Wir ___ im Mai um.").
- Never use the target word anywhere else in the sentence.
- Work the support words in where they fit naturally, in any form. Otherwise use only A1 and A2 vocabulary.
- answer: the exact text that fills the gap.
- accepted: other forms that are also correct in this gap. Usually none.
- cue: the target's English meaning as used in this sentence, 1 to 4 words.
- translation: the whole sentence in English, gap filled.
- glosses: for each word in the sentence above A1 level, other than the target, {"de": the word exactly as it appears, "en": its English meaning here}. Include the support words.

Reply with only a JSON object: {"items": [{"id", "sentence", "answer", "accepted", "cue", "translation", "glosses"}]}`,
  buildUser: (input) => `Bundles:\n${JSON.stringify(input.bundles)}`,
  check(output, input) {
    const expected = input.bundles.map((b) => b.id);
    const got = output.items.map((i) => i.id);
    const missing = expected.filter((id) => !got.includes(id));
    if (missing.length) return `missing items for ids ${missing.join(', ')}`;
    const extra = got.filter((id) => !expected.includes(id));
    if (extra.length) return `unexpected ids ${extra.join(', ')}`;
    return null;
  },
};
