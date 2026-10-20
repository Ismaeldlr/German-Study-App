import { z } from 'zod';

import { matchTarget, SENTENCE_VERDICTS, TARGET_VERDICTS } from '@/core/translation';

import { CATEGORY_RULES, mistakeCategory } from './categories';
import type { LlmTask } from './task';

/**
 * Grade a translation. Any correct German is accepted, not just the
 * reference; each target word gets its own verdict so its card can be
 * rated, and every error gets a category for the weak spots.
 */

export interface GradeTranslationInput {
  english: string;
  reference: string;
  answer: string;
  targets: { word: string; meaning: string }[];
  grammar: string | null;
}

const schema = z.object({
  verdict: z.enum(SENTENCE_VERDICTS),
  targets: z.array(z.object({ word: z.string(), verdict: z.enum(TARGET_VERDICTS) })),
  errors: z
    .array(
      z.object({
        category: mistakeCategory,
        text: z.string(),
        correction: z.string(),
        explanation: z.string(),
        word: z.string().nullable().optional().default(null),
      }),
    )
    .optional()
    .default([]),
  corrected: z.string(),
  natural: z.string(),
  explanation: z.string(),
});
export type GradeTranslationOutput = z.infer<typeof schema>;

export const gradeTranslation: LlmTask<GradeTranslationInput, GradeTranslationOutput> = {
  name: 'grade_translation',
  version: '1',
  temperature: 0.1,
  schema,
  maxTokens: 700,
  system: `Task: grade_translation
You are a patient German teacher grading an A2 learner's translation of an English sentence. The learner's class uses the Momente A2 textbook.

Rules:
- Accept any correct German that means the same as the English, not only the reference. Judge meaning and grammar; ignore punctuation.
- verdict: "correct" when there are no errors, "minor" when the only errors are small slips (a missing umlaut, a lowercase noun, one wrong letter), "wrong" otherwise.
- targets: one entry per target word, in order, {"word": the target exactly as given, "verdict"}:
  - "correct": the learner used the word correctly, in the right form.
  - "slip": used with a small slip (umlaut, capitalization, one letter).
  - "wrong": tried the word but in a wrong form (ending, conjugation, article), or a different word in its place.
  - "missing": the word, or a correct synonym of it, is not in the answer at all.
- errors: every error in the answer, {"category", "text": the wrong part exactly as the learner wrote it, "correction": the fixed part, "explanation": one short English line, "word": the target word it concerns, or null}. An empty list when the answer is correct.
- corrected: the learner's sentence with only the errors fixed, keeping their wording.
- natural: how a native speaker would most naturally say it.
- explanation: one or two short English sentences on the most important point, or praise when it is correct.
${CATEGORY_RULES}

Reply with only a JSON object: {"verdict", "targets": [{"word", "verdict"}], "errors": [{"category", "text", "correction", "explanation", "word"}], "corrected", "natural", "explanation"}`,
  buildUser: (input) =>
    JSON.stringify({
      english: input.english,
      reference: input.reference,
      grammar: input.grammar,
      targets: input.targets,
      answer: input.answer,
    }),
  check(output, input) {
    const missing = input.targets.filter((t) => !matchTarget(output.targets, t.word));
    if (missing.length) return `targets is missing ${missing.map((t) => t.word).join(', ')}`;
    return null;
  },
};
