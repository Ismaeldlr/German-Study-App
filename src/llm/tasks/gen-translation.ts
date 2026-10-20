import { z } from 'zod';

import type { LlmTask } from './task';

/**
 * English sentences to translate into German, each built around one or
 * two mature words and sometimes a grammar point. Whether each reference
 * really uses its targets is checked per item afterwards.
 */

export interface TranslationBundleInput {
  id: number;
  /** As written on a card, with type and meaning: the words to produce. */
  targets: { word: string; type: string; meaning: string }[];
  grammar: string | null;
  topic: string;
}

export interface GenTranslationInput {
  items: TranslationBundleInput[];
}

const item = z.object({
  id: z.number().int(),
  english: z.string(),
  reference: z.string(),
  cues: z.array(z.string()).optional().default([]),
});

const schema = z.object({ items: z.array(item) });
export type GenTranslationOutput = z.infer<typeof schema>;
export type GenTranslationItem = z.infer<typeof item>;

export const genTranslation: LlmTask<GenTranslationInput, GenTranslationOutput> = {
  name: 'gen_translation',
  version: '1',
  temperature: 0.8,
  schema,
  maxTokens: (input) => 150 + 120 * input.items.length,
  system: `Task: gen_translation
You write English sentences for an A2 German learner to translate into German. The learner's class uses the Momente A2 textbook.

Rules:
- Every item has an id. Return exactly one item per id, in the same order.
- english: one natural English sentence of 6 to 16 words about the item's topic. A correct German translation must use every target word, in whatever form the sentence needs. When the item names a grammar point, the translation must also apply it.
- Keep the German an A2 learner could write: present, Perfekt, modal verbs, simple subordinate clauses. No idioms that do not translate word for word.
- reference: one correct, natural German translation that uses every target word.
- cues: for each target, in order, the English word or words in your sentence that stand for it.

Reply with only a JSON object: {"items": [{"id", "english", "reference", "cues"}]}`,
  buildUser: (input) => `Items:\n${JSON.stringify(input.items)}`,
  check(output, input) {
    const expected = input.items.map((i) => i.id);
    const got = output.items.map((i) => i.id);
    const missing = expected.filter((id) => !got.includes(id));
    if (missing.length) return `missing items for ids ${missing.join(', ')}`;
    const extra = got.filter((id) => !expected.includes(id));
    if (extra.length) return `unexpected ids ${extra.join(', ')}`;
    return null;
  },
};
