import { z } from 'zod';

import { drillProblem, DRILL_SIZE } from '@/core/drills';
import type { Example } from '@/core/model';

import { CATEGORY_RULES, mistakeCategory } from './categories';
import type { LlmTask } from './task';

/** Five short gap items on one grammar point, built from words you know. */

export interface GenDrillInput {
  point: string;
  summary: string;
  examples: Example[];
  /** Mistake categories the rule is about, for each item's category. */
  categories: string[];
  /** Lemmas from your deck to build the sentences from. */
  known: string[];
  topic: string;
}

const item = z.object({
  sentence: z.string(),
  hint: z.string(),
  answer: z.string(),
  accepted: z.array(z.string()).optional().default([]),
  translation: z.string(),
  explanation: z.string(),
  category: mistakeCategory,
});

const schema = z.object({ items: z.array(item) });
export type GenDrillOutput = z.infer<typeof schema>;

export const genGrammarDrill: LlmTask<GenDrillInput, GenDrillOutput> = {
  name: 'gen_grammar_drill',
  version: '1',
  temperature: 0.7,
  schema,
  maxTokens: 1200,
  system: `Task: gen_grammar_drill
You write a short grammar drill for an A2 German learner whose class uses the Momente A2 textbook. The drill practises exactly one grammar point.

Rules:
- Write exactly ${DRILL_SIZE} items. Each tests the grammar point in a different sentence, and they vary (different words, cases, persons).
- sentence: one natural German sentence of 5 to 14 words at A2 level, about the topic where it fits. Replace the part that applies the rule with exactly "___" (three underscores). The gap is one word, or two when the rule needs it (a verb and its particle stay apart, so gap only one of them).
- hint: what the learner changes to fill the gap, shown in brackets after the sentence: the base form ("der Bus", "fahren", "schön") or, for word order, the words to arrange.
- answer: the exact text that fills the gap.
- accepted: other answers that are also correct in this gap. Usually none.
- translation: the whole sentence in English, gap filled.
- explanation: one short English line on why this answer ("mit takes the dative: der Bus becomes dem Bus").
- category: the mistake a wrong answer here would be.
- Build the sentences from the learner's known words where they fit. Otherwise use only A1 and A2 vocabulary.
${CATEGORY_RULES}

Reply with only a JSON object: {"items": [{"sentence", "hint", "answer", "accepted", "translation", "explanation", "category"}]}`,
  buildUser: (input) =>
    JSON.stringify({
      point: input.point,
      summary: input.summary,
      examples: input.examples,
      categories: input.categories,
      topic: input.topic,
      known: input.known,
    }),
  check: (output) => drillProblem(output.items, DRILL_SIZE),
};
