import type { Example, MistakeCategory } from './model';

/**
 * A grammar point as you add or edit it: the rule's name, a short English
 * label and summary, examples, and the mistake categories it is about.
 * It becomes an item of kind grammar with one card that is drilled.
 */

export interface GrammarFields {
  /** The rule's name, usually German: "Dativ nach mit, bei, von". */
  name: string;
  /** A few English words, shown where a word would show its meaning. */
  label: string;
  /** One to three English sentences. */
  summary: string;
  examples: Example[];
  categories: MistakeCategory[];
}

export const MAX_GRAMMAR_EXAMPLES = 5;

export function emptyGrammarFields(name = ''): GrammarFields {
  return { name, label: '', summary: '', examples: [], categories: [] };
}

/** Problems that block saving. */
export function validateGrammar(fields: GrammarFields): string[] {
  const errors: string[] = [];
  if (!fields.name.trim()) errors.push('Enter the name of the rule.');
  if (!fields.summary.trim()) errors.push('Enter a short summary of the rule.');
  if (cleanExamples(fields.examples).length === 0) errors.push('Enter at least one example.');
  return errors;
}

/** Trimmed examples with German text, at most MAX_GRAMMAR_EXAMPLES. */
export function cleanExamples(examples: readonly Example[]): Example[] {
  return examples
    .map((e) => ({ de: e.de.replace(/\s+/g, ' ').trim(), en: e.en.replace(/\s+/g, ' ').trim() }))
    .filter((e) => e.de)
    .slice(0, MAX_GRAMMAR_EXAMPLES);
}

/** "Ich fahre mit dem Bus. = I go by bus." lines, one example per line. */
export function parseExamples(text: string): Example[] {
  return cleanExamples(
    text.split('\n').map((line) => {
      const [de, ...en] = line.split('=');
      return { de: de ?? '', en: en.join('=') };
    }),
  );
}

export function formatExamples(examples: readonly Example[]): string {
  return examples.map((e) => (e.en ? `${e.de} = ${e.en}` : e.de)).join('\n');
}
