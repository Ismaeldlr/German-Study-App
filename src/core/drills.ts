import { checkGerman, normalizeAnswer, type SlipKind } from './answers';
import { BLANK } from './gap-fill';
import type { CardGrade, MistakeNote } from './grading';
import type { MistakeCategory } from './model';

/**
 * Grammar drills and contrast sets: a few short gap items on one rule, or
 * on two words you mix up. Each item is graded as you go; the set as a
 * whole becomes one rating per card.
 */

export interface DrillItem {
  /** One sentence with exactly one BLANK. */
  sentence: string;
  /** Shown after the sentence: the base form to change, or an English cue. */
  hint: string;
  answer: string;
  accepted: string[];
  translation: string;
  /** One line on why this answer, shown after you answer. */
  explanation: string;
  /** What a wrong answer counts as, for the weak spots. */
  category: MistakeCategory;
  /**
   * The umlaut is the grammar here (hätte or hatte), so a missing or extra
   * one is a wrong answer, not a typing slip.
   */
  strictUmlauts?: boolean;
}

export interface GrammarDrill {
  /** The rule's name, as on the grammar item. */
  point: string;
  items: DrillItem[];
  /** For a drill from a built-in topic: the topic and which of its bank items it asks. */
  bank?: { topic: string; keys: string[] };
}

export interface ContrastWord {
  /** The deck item, or null for a partner word that is not in your deck. */
  itemId: number | null;
  cardId: number | null;
  word: string;
  meaning: string;
}

export interface ContrastItem extends DrillItem {
  /** Index into the set's words: which word fills this gap. */
  word: number;
}

export interface ContrastSet {
  words: ContrastWord[];
  /** How to tell the words apart, in English. */
  explanation: string;
  items: ContrastItem[];
}

export const DRILL_SIZE = 5;
export const CONTRAST_SIZE = 6;

export interface ItemResult {
  outcome: 'correct' | 'slip' | 'wrong';
  slips: SlipKind[];
  expected: string;
  mistake: MistakeNote | null;
}

/** Grade one typed answer. A revealed answer is passed as an empty string. */
export function gradeDrillItem(item: DrillItem, given: string): ItemResult {
  const check = checkGerman(given, [item.answer, ...item.accepted]);
  const answer = normalizeAnswer(given);
  if (check.verdict === 'correct') {
    return { outcome: 'correct', slips: [], expected: check.expected, mistake: null };
  }
  if (check.verdict === 'slip' && !(item.strictUmlauts && check.slips.includes('umlaut'))) {
    const capitalization =
      check.slips.includes('capitalization') && !check.slips.includes('umlaut');
    return {
      outcome: 'slip',
      slips: check.slips,
      expected: check.expected,
      mistake: {
        category: capitalization ? 'capitalization' : 'spelling',
        yourText: answer,
        correction: check.expected,
        explanation: capitalization
          ? 'German capitalizes every noun.'
          : 'Mind the umlaut (ä, ö, ü, ß).',
      },
    };
  }
  return {
    outcome: 'wrong',
    slips: [],
    expected: check.expected,
    mistake: answer
      ? {
          category: item.category,
          yourText: answer,
          correction: check.expected,
          explanation: item.explanation,
        }
      : null,
  };
}

/**
 * The outcome of a set: all right is right, slips only is a slip, and one
 * miss in a set of three or more is still a slip. More misses are wrong.
 */
export function setOutcome(results: readonly Pick<ItemResult, 'outcome'>[]): CardGrade['outcome'] {
  const wrong = results.filter((r) => r.outcome === 'wrong').length;
  const slips = results.filter((r) => r.outcome === 'slip').length;
  if (results.length === 0) return 'wrong';
  if (wrong === 0) return slips ? 'slip' : 'correct';
  if (wrong === 1 && results.length >= 3) return 'slip';
  return 'wrong';
}

/** One grade for a set of item results. */
export function setGrade(results: readonly ItemResult[]): CardGrade {
  const right = results.filter((r) => r.outcome !== 'wrong').length;
  return {
    outcome: setOutcome(results),
    slips: [...new Set(results.flatMap((r) => r.slips))],
    expected: `${right} of ${results.length} right`,
    mistakes: results.flatMap((r) => (r.mistake ? [r.mistake] : [])),
  };
}

/** Why a generated set cannot be used, or null when it is fine. */
export function drillProblem(
  items: readonly Pick<DrillItem, 'sentence' | 'answer'>[],
  min: number,
): string | null {
  if (items.length < min) return `needs at least ${min} items, got ${items.length}`;
  for (const [i, item] of items.entries()) {
    const blanks = item.sentence.split(BLANK).length - 1;
    if (blanks !== 1) return `item ${i + 1} needs exactly one ${BLANK}, found ${blanks}`;
    if (!normalizeAnswer(item.answer)) return `item ${i + 1} has no answer`;
  }
  return null;
}

/** Item indices each word of a contrast set fills. */
export function itemsByWord(set: Pick<ContrastSet, 'words' | 'items'>): number[][] {
  return set.words.map((_, w) => set.items.flatMap((item, i) => (item.word === w ? [i] : [])));
}
