import { normalizeAnswer } from './answers';
import type { MistakeNote } from './grading';
import { isFormOf, type InflectionSource } from './inflection';
import type { MistakeCategory } from './model';

/**
 * Translate and correct: an English sentence you write in German. The LLM
 * accepts any correct German, marks errors and offers a more natural
 * version. Each target word gets its own verdict, and so its own rating:
 * the exercise is there to make you produce those words.
 */

export interface TranslationTarget {
  cardId: number;
  itemId: number;
  /** As written on a card: "die Wohnung". */
  word: string;
  meaning: string;
}

/** A cached translation exercise. */
export interface TranslationExercise {
  english: string;
  /** One correct German version. Any other correct version counts too. */
  reference: string;
  /** The English words that stand for the targets, so you know what is practised. */
  cues: string[];
  targets: TranslationTarget[];
  /** A grammar point the sentence practises, if any. */
  grammar: string | null;
}

export const SENTENCE_VERDICTS = ['correct', 'minor', 'wrong'] as const;
export type SentenceVerdict = (typeof SENTENCE_VERDICTS)[number];

/** correct, a small slip, wrong (wrong form or word), or missing (not used). */
export const TARGET_VERDICTS = ['correct', 'slip', 'wrong', 'missing'] as const;
export type TargetVerdict = (typeof TARGET_VERDICTS)[number];

export interface TranslationError {
  category: MistakeCategory;
  /** The wrong part as you wrote it. */
  text: string;
  correction: string;
  explanation: string;
  /** The target word the error is about, or null. */
  word: string | null;
}

export interface GradedTarget {
  cardId: number;
  itemId: number;
  word: string;
  verdict: TargetVerdict;
}

export interface TranslationGrade {
  verdict: SentenceVerdict;
  targets: GradedTarget[];
  errors: TranslationError[];
  /** Your sentence with only the errors fixed. */
  corrected: string;
  /** How a native speaker would say it. */
  natural: string;
  /** A short English explanation of the main point. */
  explanation: string;
}

/** How one target word went, for the rating. A word you did not use was not recalled. */
export function targetOutcome(verdict: TargetVerdict): 'correct' | 'slip' | 'wrong' {
  switch (verdict) {
    case 'correct':
      return 'correct';
    case 'slip':
      return 'slip';
    default:
      return 'wrong';
  }
}

/**
 * The mistakes to log against one target. Errors about another target go
 * there; errors about no target in particular go with the first one, so
 * each error is logged once.
 */
export function mistakesFor(grade: TranslationGrade, itemId: number): MistakeNote[] {
  const first = grade.targets[0]?.itemId;
  const wordOf = new Map(grade.targets.map((t) => [key(t.word), t.itemId]));
  return grade.errors
    .filter((e) => {
      const owner = e.word ? (wordOf.get(key(e.word)) ?? first) : first;
      return owner === itemId;
    })
    .map((e) => ({
      category: e.category,
      yourText: e.text,
      correction: e.correction,
      explanation: e.explanation,
    }));
}

/** Why a generated exercise cannot be used, or null when it is fine. */
export function translationProblem(
  exercise: Pick<TranslationExercise, 'english' | 'reference'>,
  targets: readonly InflectionSource[],
): string | null {
  if (!normalizeAnswer(exercise.english)) return 'the English sentence is empty';
  const words = exercise.reference.split(/\s+/).length;
  if (words < 3 || words > 25) return `the reference has ${words} words`;
  for (const target of targets) {
    if (!isFormOf(exercise.reference, target)) {
      return `the reference does not use ${target.lemma}`;
    }
  }
  return null;
}

/** Match an LLM's target word back to the exercise's target, ignoring articles and case. */
export function matchTarget<T extends { word: string }>(targets: readonly T[], word: string) {
  return targets.find((t) => key(t.word) === key(word));
}

function key(word: string): string {
  return normalizeAnswer(word)
    .toLowerCase()
    .replace(/^(der|die|das)\s+/, '');
}
