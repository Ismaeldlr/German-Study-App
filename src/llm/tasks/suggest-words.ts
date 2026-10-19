import { z } from 'zod';

import { WORD_FIELD_RULES, wordFields, wordProblem } from './enrich-words';
import type { LlmTask } from './task';

/** New A2 words for the current chapter or a topic you give, each with a reason. */

export interface SuggestInput {
  chapter: { title: string; themes: string[] } | null;
  topic: string | null;
  /** Lemmas you already know, for word families and to avoid repeats. */
  known: string[];
  /** Lemmas never to suggest: already suggested or rejected. */
  avoid: string[];
  count: number;
}

const suggestion = wordFields.extend({ reason: z.string() });
const schema = z.object({ items: z.array(suggestion) });
export type SuggestOutput = z.infer<typeof schema>;
export type SuggestedWord = z.infer<typeof suggestion>;

export const suggestWords: LlmTask<SuggestInput, SuggestOutput> = {
  name: 'suggest_words',
  version: '1',
  temperature: 0.7,
  schema,
  maxTokens: (input) => 200 + 230 * input.count,
  system: `Task: suggest_words
You suggest new vocabulary for an A2 German learner whose class uses the Momente A2 textbook.

Rules:
- Suggest as many words as the input's count asks for.
- Every word must be at A2 level or below, fit the topic (or, without one, the chapter's themes), and appear in neither the known list nor the avoid list.
- Prefer word families and collocations of known words: someone who knows "wohnen" should get "Mitbewohner" or "Miete" before an unrelated word.
- For each word, fill the dictionary fields like a vocabulary entry:
${WORD_FIELD_RULES}
- reason: one short English line on why this word now, naming the known word it connects to when there is one.
- Write meanings, example_en and reason in English. Keep all German at A2 level.

Reply with only a JSON object: {"items": [{"kind", "lemma", "article", "plural", "verb", "separable", "reflexive", "case", "meanings", "example_de", "example_en", "reason"}]}`,
  buildUser: (input) =>
    JSON.stringify({
      count: input.count,
      topic: input.topic,
      chapter: input.chapter,
      known: input.known,
      avoid: input.avoid,
    }),
  check(output) {
    if (output.items.length === 0) return 'no words suggested';
    for (const [i, word] of output.items.entries()) {
      const problem = wordProblem(word) ?? (word.reason.trim() ? null : 'reason is empty');
      if (problem) return `item ${i + 1} (${word.lemma || 'no lemma'}): ${problem}`;
    }
    return null;
  },
};
