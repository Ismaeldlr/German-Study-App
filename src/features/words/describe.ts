import type { CardType, GrammaticalCase, MistakeCategory } from '@/core/model';
import { DAY_MS } from '@/core/time';
import type { TargetVerdict } from '@/core/translation';

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  recognize: 'Meaning (DE → EN)',
  produce: 'Produce (EN → DE)',
  gender: 'Gender',
  plural: 'Plural',
  verb_forms: 'Verb forms',
  apply_grammar: 'Apply grammar',
};

export const CASE_LABELS: Record<GrammaticalCase, string> = {
  akk: 'Akkusativ',
  dat: 'Dativ',
  gen: 'Genitiv',
  akk_dat: 'Akkusativ or Dativ',
};

export const RATING_LABELS: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

const STATE_LABELS = ['New', 'Learning', 'Review', 'Relearning'];
export const stateLabel = (state: number) => STATE_LABELS[state] ?? 'Unknown';

/** "due now", "due in 3 days", "due in 5 min". */
export function describeDue(due: number, now: number): string {
  const diff = due - now;
  if (diff <= 0) return 'due now';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `due in ${minutes} min`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `due in ${hours} h`;
  const days = Math.round(diff / DAY_MS);
  return days === 1 ? 'due tomorrow' : `due in ${days} days`;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const MISTAKE_LABELS: Record<MistakeCategory, string> = {
  article: 'Articles',
  case_ending: 'Case endings',
  adjective_ending: 'Adjective endings',
  word_order: 'Word order',
  verb_form: 'Verb forms',
  spelling: 'Spelling and umlauts',
  wrong_word: 'Wrong word',
  capitalization: 'Capital letters',
};

export const MISTAKE_DESCRIPTIONS: Record<MistakeCategory, string> = {
  article: 'der, die or das, and ein or eine',
  case_ending: 'den or dem, einen or einem: the case after a verb or preposition',
  adjective_ending: 'schöne or schönen: the ending after an article',
  word_order: 'where the verb goes, in main and subordinate clauses',
  verb_form: 'conjugation, tense and the Perfekt with haben or sein',
  spelling: 'misspelled words and missing umlauts',
  wrong_word: 'a different word than the one needed',
  capitalization: 'nouns start with a capital letter',
};

/** A grammar point to add when a weak spot has none. Spelling and word choice are not grammar. */
export const SUGGESTED_GRAMMAR: Partial<Record<MistakeCategory, string>> = {
  article: 'Artikel und Genus',
  case_ending: 'Akkusativ und Dativ',
  adjective_ending: 'Adjektivdeklination',
  word_order: 'Verbposition im Haupt- und Nebensatz',
  verb_form: 'Perfekt mit haben oder sein',
};

export const VERDICT_LABELS: Record<TargetVerdict, string> = {
  correct: 'used correctly',
  slip: 'a small slip',
  wrong: 'wrong form or word',
  missing: 'not used',
};
