import { z } from 'zod';

import { ARTICLES, AUXILIARIES, CASES } from '@/core/model';

import type { LlmTask } from './task';

/** Fill in the dictionary data for one word or a batch of up to 25 pasted lines. */

export const ENRICH_KINDS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'] as const;
export const ENRICH_FIELDS = [
  'lemma',
  'kind',
  'article',
  'plural',
  'verb',
  'case',
  'meanings',
] as const;
export type EnrichField = (typeof ENRICH_FIELDS)[number];

const verbForms = z.object({
  present3: z.string(),
  preterite: z.string(),
  participle: z.string(),
  auxiliary: z.enum(AUXILIARIES),
});

/** The dictionary fields of one word, shared with suggest_words. */
export const wordFields = z.object({
  kind: z.enum(ENRICH_KINDS),
  lemma: z.string(),
  article: z.enum(ARTICLES).nullable(),
  plural: z.string().nullable(),
  verb: verbForms.nullable(),
  separable: z.boolean(),
  reflexive: z.boolean(),
  case: z.enum(CASES).nullable(),
  meanings: z.array(z.string()),
  example_de: z.string(),
  example_en: z.string(),
});

const record = wordFields.extend({
  id: z.number().int(),
  status: z.enum(['ok', 'unclear']),
  low_confidence: z.array(z.string()).optional().default([]),
  note: z.string().nullable().optional(),
});

export type EnrichRecord = z.infer<typeof record>;
export interface EnrichInput {
  lines: { id: number; text: string }[];
}

const schema = z.object({ items: z.array(record) });

/** How to fill each dictionary field. Static text, shared with suggest_words. */
export const WORD_FIELD_RULES = `- lemma: nouns in nominative singular without article (plural-only nouns in the plural); verbs in the infinitive, with "sich" first when reflexive ("sich freuen"); separable verbs written joined ("umziehen"); phrases as written, tidied.
- kind: noun, verb, adjective, adverb or phrase. Prepositions, conjunctions and fixed expressions are phrase.
- article: der, die or das for nouns. null for plural-only nouns and for everything that is not a noun.
- plural: the nominative plural of a noun ("Wohnungen"). null when the noun has no plural, and for non-nouns.
- verb: for verbs only, {"present3": 3rd person singular present ("zieht um"), "preterite": 3rd person singular Präteritum ("zog um"), "participle": Partizip II ("umgezogen"), "auxiliary": "haben" or "sein"}. null for other kinds.
- separable and reflexive: true or false for verbs, false for everything else.
- case: the case a verb or preposition governs: "akk", "dat", "gen", or "akk_dat" for two-way prepositions. For "sich freuen auf", the case after the preposition. null when none applies.
- meanings: 1 to 3 short English meanings, most common first. Verb meanings start with "to".
- example_de: one natural sentence at A2 level that uses the word. example_en: its English translation.`;

export const enrichWords: LlmTask<EnrichInput, z.infer<typeof schema>> = {
  name: 'enrich_words',
  version: '1',
  temperature: 0.2,
  schema,
  maxTokens: (input) => 300 + 220 * input.lines.length,
  system: `Task: enrich_words
You help an A2 German learner whose class uses the Momente A2 textbook. For each input line, return dictionary data for the German word or phrase on it.

Rules:
- Every line has an id. Return exactly one record per id, in the same order.
- A line can hold any form or textbook notation: "Wohnung", "zog um", "die Wohnung, -en", "umziehen, zog um, ist umgezogen", or a word followed by a translation. Use a translation on the line as the main meaning.
${WORD_FIELD_RULES}
- low_confidence: names of fields you are unsure about, from: lemma, kind, article, plural, verb, case, meanings.
- status: "unclear" when the line is not a German word or phrase (a heading, a page number, noise). Still fill the other fields with your best guess or empty values.
- note: null, or one short English remark the learner should know (for example a second meaning with a different gender).
- Write meanings, example_en and note in English. Keep all German at A2 level.

Reply with only a JSON object: {"items": [{"id", "status", "kind", "lemma", "article", "plural", "verb", "separable", "reflexive", "case", "meanings", "example_de", "example_en", "low_confidence", "note"}]}`,
  buildUser: (input) => `Lines:\n${JSON.stringify(input.lines)}`,
  check(output, input) {
    const expected = input.lines.map((l) => l.id);
    const got = output.items.map((r) => r.id);
    const missing = expected.filter((id) => !got.includes(id));
    if (missing.length) return `missing records for ids ${missing.join(', ')}`;
    const extra = got.filter((id) => !expected.includes(id));
    if (extra.length) return `unexpected ids ${extra.join(', ')}`;
    for (const r of output.items) {
      const problem = r.status === 'ok' ? wordProblem(r) : null;
      if (problem) return `id ${r.id}: ${problem}`;
    }
    return null;
  },
};

/** What is missing from one word's fields, or null when they are usable. */
export function wordProblem(r: z.infer<typeof wordFields>): string | null {
  if (!r.lemma.trim()) return 'lemma is empty';
  if (r.meanings.filter((m) => m.trim()).length === 0) return 'meanings is empty';
  if (r.kind === 'noun' && !r.article && !r.plural) {
    return 'a noun needs an article, or a plural if it is plural-only';
  }
  if (r.kind === 'verb' && !r.verb) return 'verb forms are missing';
  return null;
}
