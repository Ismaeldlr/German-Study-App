import { z } from 'zod';

import { MISTAKE_CATEGORIES, type MistakeCategory } from '@/core/model';

/** Mistake categories in LLM output. Close spellings are mapped; anything else is a wrong word. */
export const mistakeCategory = z.string().transform(toCategory);

export function toCategory(raw: string): MistakeCategory {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((MISTAKE_CATEGORIES as readonly string[]).includes(name)) return name as MistakeCategory;
  if (/adjective/.test(name)) return 'adjective_ending';
  if (/case|dative|accusative|genitive|declension/.test(name)) return 'case_ending';
  if (/order|position/.test(name)) return 'word_order';
  if (/verb|tense|conjugation|auxiliary|participle/.test(name)) return 'verb_form';
  if (/article|gender/.test(name)) return 'article';
  if (/capital/.test(name)) return 'capitalization';
  if (/spell|umlaut|typo/.test(name)) return 'spelling';
  return 'wrong_word';
}

/** How to name a mistake's category. Static text, shared by the tasks that log mistakes. */
export const CATEGORY_RULES = `Mistake categories, use exactly one of these names:
- article: wrong der/die/das or ein/eine, or a missing article.
- case_ending: wrong case or case ending on an article, pronoun or noun (den/dem, einen/einem).
- adjective_ending: wrong adjective ending (schöne/schönen).
- word_order: verb in the wrong position, wrong order in a subordinate clause.
- verb_form: wrong conjugation, tense, Perfekt helper (haben/sein) or participle.
- spelling: a misspelled word, a missing umlaut or ß.
- wrong_word: a different word than the one needed, or a missing word.
- capitalization: a noun written in lowercase, or a lowercase word capitalized.`;
