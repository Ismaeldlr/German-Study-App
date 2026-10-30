import type { DrillItem } from '@/core/drills';
import type { Example, MistakeCategory } from '@/core/model';

/**
 * The built-in grammar path: the Momente syllabus from A1 to B1 and a
 * grammar topic for every point it teaches, each with an explanation and a
 * bank of drill items. It ships with the app, so it works offline and
 * costs nothing; the LLM only adds fresh drills once a bank is worn out.
 */

export const LEVELS = ['A1', 'A2', 'B1'] as const;
export type Level = (typeof LEVELS)[number];

/** Momente's part volumes. Each has twelve lessons; the second continues at 13. */
export const BOOK_IDS = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'] as const;
export type BookId = (typeof BOOK_IDS)[number];

/** A lesson as "A2.1/6": the part volume and the lesson number. */
export type LessonRef = `${BookId}/${number}`;

export interface Lesson {
  book: BookId;
  /** As printed in the book: 1 to 12 in the first part volume, 13 to 24 in the second. */
  number: number;
  title: string;
  /** The lesson's topics, for chapter themes and generated content. */
  themes: string[];
  /** The grammar the lesson lists, in the book's terms. */
  grammar: string[];
}

export interface Book {
  id: BookId;
  level: Level;
  lessons: Lesson[];
}

export const BLOCK_IDS = [
  'articles',
  'cases',
  'pronouns',
  'present',
  'modals',
  'tenses',
  'konjunktiv',
  'passive',
  'sentence',
  'clauses',
  'prepositions',
  'adjectives',
  'numbers',
  'word_formation',
] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

export interface Block {
  id: BlockId;
  /** German, as a textbook names it. */
  name: string;
  /** A few English words. */
  label: string;
  icon: string;
}

/**
 * One part of a topic's explanation. Text, bullets and table cells may mark
 * words **bold**, such as the ending that changes.
 */
export interface Section {
  title: string;
  text?: string;
  bullets?: string[];
  /** Rows of cells; the first row is the header. */
  table?: string[][];
  examples?: Example[];
}

/** A drill item as written in the topic files, kept short to read and edit. */
export interface DrillSource {
  /** The sentence with exactly one ___ gap. */
  s: string;
  /** Shown in brackets after it: the base form, or the choices ("weil / denn"). */
  h: string;
  /** What fills the gap. */
  a: string;
  /** The whole sentence in English. */
  en: string;
  /** One line on why, shown after answering. */
  why: string;
  /** Other answers that are right in this gap. */
  ok?: string[];
  /** What a wrong answer counts as; the topic's first category by default. */
  cat?: MistakeCategory;
}

export interface TopicSource {
  /** Stable, kebab-case: it links the topic to its card in your deck. */
  id: string;
  /** German, as Momente names it: "Konjunktiv II: Ratschläge mit sollte und könnte". */
  name: string;
  /** A few English words: "giving advice". */
  label: string;
  level: Level;
  block: BlockId;
  /** Where Momente teaches it. Empty for a topic the book only uses. */
  lessons: LessonRef[];
  /** Extra search words: "der die das", "um zu". */
  keywords?: string[];
  /** The mistakes this topic is about, most important first. */
  categories: MistakeCategory[];
  /** One to three English sentences: the rule in a nutshell. */
  summary: string;
  sections: Section[];
  /** German and English, the best first. */
  examples: [string, string][];
  /**
   * The umlaut is the grammar here (hätte or hatte, würde or wurde), so a
   * missing one is a wrong answer rather than a typing slip.
   */
  strictUmlauts?: boolean;
  drills: DrillSource[];
}

/** A drill item in a topic's bank. `key` stays the same while its sentence does. */
export interface BankItem extends DrillItem {
  key: string;
}

export interface Topic extends Omit<TopicSource, 'examples' | 'drills'> {
  examples: Example[];
  drills: BankItem[];
}
