import { checkGerman, editDistance, normalizeAnswer, stripUmlauts } from './answers';
import { CardState } from './cards';
import type { CardGrade, MistakeNote } from './grading';
import { isFormOf, type InflectionSource } from './inflection';
import type { ItemKind, MistakeCategory } from './model';

/**
 * Gap fill: a generated A2 sentence with the target word blanked out. You
 * type the missing word in the form the sentence needs, endings included.
 */

export const BLANK = '___';
/** A card never sees the same sentence again within its last this-many exercises. */
export const FRESHNESS_WINDOW = 5;
/** Latin letters, umlauts and ß. Hermes regexes have no \p{L}. */
const L = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF';
const NON_LETTERS = new RegExp(`[^${L}0-9]+`, 'g');
const EDGE_NON_LETTERS = new RegExp(`^[^${L}]+|[^${L}]+$`, 'g');

export interface Gloss {
  de: string;
  en: string;
}

/** A validated gap sentence, as stored in the exercise cache. */
export interface GapExercise {
  /** The sentence with exactly one BLANK where the target goes. */
  sentence: string;
  /** The exact form that fills the blank. */
  answer: string;
  /** Other forms that are also right in this sentence. */
  accepted: string[];
  /** A short English cue for the missing word. */
  cue: string;
  /** The whole sentence in English, shown after you answer. */
  translation: string;
  /** English glosses for words in the sentence you might not know. */
  glosses: Gloss[];
}

export type GapHint = 'first_letter' | 'none';

/**
 * Learning cards get the first letter for free; review cards start without
 * it. The free letter is part of the exercise, so it does not lower the
 * rating. Asking for it on a review card does.
 */
export function gapHint(card: { state: number }): GapHint {
  return card.state === CardState.Review ? 'none' : 'first_letter';
}

export function firstLetter(answer: string): string {
  return normalizeAnswer(answer).charAt(0);
}

/** The sentence around the blank. */
export function splitGap(sentence: string): { before: string; after: string } {
  const index = sentence.indexOf(BLANK);
  if (index < 0) return { before: sentence, after: '' };
  return { before: sentence.slice(0, index), after: sentence.slice(index + BLANK.length) };
}

export function fillGap(exercise: Pick<GapExercise, 'sentence' | 'answer'>): string {
  const { before, after } = splitGap(exercise.sentence);
  return `${before}${exercise.answer}${after}`;
}

/** Identity of a sentence regardless of spacing, punctuation and case. */
export function sentenceHash(sentence: string): string {
  const text = stripUmlauts(normalizeAnswer(sentence).toLowerCase())
    .replace(NON_LETTERS, ' ')
    .trim();
  // FNV-1a, 32 bit: plenty for comparing a card's last few sentences.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function isFresh(hash: string, recentHashes: readonly string[]): boolean {
  return !recentHashes.slice(0, FRESHNESS_WINDOW).includes(hash);
}

/**
 * Why a generated sentence cannot be used, or null when it is fine. The
 * target must fill the blank in some inflected form, and must not also sit
 * elsewhere in the sentence where it would give the answer away.
 */
export function gapProblem(exercise: GapExercise, target: InflectionSource): string | null {
  const blanks = exercise.sentence.split(BLANK).length - 1;
  if (blanks !== 1) return `needs exactly one ${BLANK}, found ${blanks}`;
  const answer = normalizeAnswer(exercise.answer);
  if (!answer) return 'the answer is empty';
  if (!isFormOf(answer, target)) return `"${answer}" is not a form of ${target.lemma}`;
  const rest = ` ${stripUmlauts(exercise.sentence.replace(BLANK, ' ').toLowerCase())} `;
  const firstWord = stripUmlauts(answer.split(/\s+/)[0].toLowerCase());
  if (new RegExp(`[^${L}]${escapeRegExp(firstWord)}[^${L}]`).test(rest)) {
    return `"${answer}" also appears outside the blank`;
  }
  const length = exercise.sentence.split(/\s+/).length;
  if (length < 4 || length > 30) return `the sentence has ${length} words`;
  return null;
}

/** Grade a typed gap answer against the sentence's accepted forms. */
export function gradeGapFill(exercise: GapExercise, given: string, kind: ItemKind): CardGrade {
  const accepted = [exercise.answer, ...exercise.accepted];
  const check = checkGerman(given, accepted);
  const answer = normalizeAnswer(given);
  const mistakes: MistakeNote[] = check.slips.map((slip) =>
    slip === 'capitalization'
      ? {
          category: 'capitalization',
          yourText: answer,
          correction: check.expected,
          explanation: 'German capitalizes every noun.',
        }
      : {
          category: 'spelling',
          yourText: answer,
          correction: check.expected,
          explanation: 'Mind the umlaut (ä, ö, ü, ß).',
        },
  );
  if (check.verdict === 'wrong' && answer) {
    mistakes.push(wrongGapMistake(answer, check.expected, kind));
  }
  return { outcome: check.verdict, slips: check.slips, expected: check.expected, mistakes };
}

const FORM_CATEGORY: Partial<Record<ItemKind, MistakeCategory>> = {
  verb: 'verb_form',
  noun: 'case_ending',
  adjective: 'adjective_ending',
};

function wrongGapMistake(answer: string, expected: string, kind: ItemKind): MistakeNote {
  const a = stripUmlauts(answer.toLowerCase());
  const e = stripUmlauts(expected.toLowerCase());
  // Same word, different ending: the form is off, not the word.
  const sharedStem = commonPrefix(a, e) >= Math.min(4, e.length - 1);
  const formCategory = FORM_CATEGORY[kind];
  if (sharedStem && formCategory) {
    return {
      category: formCategory,
      yourText: answer,
      correction: expected,
      explanation: `Right word, wrong form: this sentence needs "${expected}".`,
    };
  }
  const close = editDistance(a, e) <= 2;
  return {
    category: close ? 'spelling' : 'wrong_word',
    yourText: answer,
    correction: expected,
    explanation: close ? 'Close, but the spelling is off.' : `The missing word is "${expected}".`,
  };
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export interface SentenceToken {
  text: string;
  gloss?: string;
  blank?: boolean;
}

/** Split a sentence into words, attaching glosses, so the screen can make them tappable. */
export function tokenize(sentence: string, glosses: readonly Gloss[]): SentenceToken[] {
  const byWord = new Map(glosses.map((g) => [glossKey(g.de), g.en]));
  const tokens: SentenceToken[] = [];
  for (const part of sentence.split(/(\s+)/)) {
    if (!part) continue;
    if (part.includes(BLANK)) {
      const [pre, post] = part.split(BLANK);
      if (pre) tokens.push({ text: pre });
      tokens.push({ text: BLANK, blank: true });
      if (post) tokens.push({ text: post });
      continue;
    }
    const gloss = byWord.get(glossKey(part));
    tokens.push(gloss ? { text: part, gloss } : { text: part });
  }
  return tokens;
}

/** How a word is looked up: lowercase, no punctuation around it, no article. */
export function glossKey(word: string): string {
  return word
    .toLowerCase()
    .replace(EDGE_NON_LETTERS, '')
    .replace(/^(der|die|das)\s+/, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
