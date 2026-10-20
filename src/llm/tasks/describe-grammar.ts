import { z } from 'zod';

import { CATEGORY_RULES, mistakeCategory } from './categories';
import type { LlmTask } from './task';

/** A grammar point you name, written up as a short English summary with examples. */

export interface DescribeGrammarInput {
  name: string;
  chapter: { title: string; themes: string[] } | null;
}

const schema = z.object({
  name: z.string(),
  label: z.string(),
  summary: z.string(),
  examples: z.array(z.object({ de: z.string(), en: z.string() })),
  categories: z.array(mistakeCategory).optional().default([]),
});
export type DescribeGrammarOutput = z.infer<typeof schema>;

export const describeGrammar: LlmTask<DescribeGrammarInput, DescribeGrammarOutput> = {
  name: 'describe_grammar',
  version: '1',
  temperature: 0.3,
  schema,
  maxTokens: 700,
  system: `Task: describe_grammar
You explain one German grammar point to an A2 learner whose class uses the Momente A2 textbook. The learner names the point, often in German ("Dativ nach mit, bei, von", "Konjunktiv II, höfliche Bitten").

Rules:
- name: the point's usual German name, tidied. Keep the learner's wording when it is already clear.
- label: 2 to 8 English words naming the rule ("dative after mit, bei, von").
- summary: 1 to 3 short English sentences: what the rule is and how to apply it. No jargon beyond case and tense names.
- examples: exactly 3 objects {"de": a natural A2 sentence that uses the rule, "en": its English translation}.
- categories: 1 or 2 names of the mistakes a learner makes when they get this rule wrong.
${CATEGORY_RULES}

Reply with only a JSON object: {"name", "label", "summary", "examples": [{"de", "en"}], "categories": []}`,
  buildUser: (input) => JSON.stringify({ point: input.name, chapter: input.chapter }),
  check(output) {
    if (!output.name.trim()) return 'name is empty';
    if (!output.summary.trim()) return 'summary is empty';
    if (output.examples.filter((e) => e.de.trim()).length === 0) return 'examples is empty';
    return null;
  },
};
