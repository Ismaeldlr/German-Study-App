import { setOutcome, type ItemResult } from './drills';
import { glossKey, gradeGapFill, type GapExercise, type Gloss } from './gap-fill';
import type { MistakeNote } from './grading';
import type { ItemKind } from './model';
import type { Outcome } from './rating';

/**
 * Mini stories: 120 to 200 words on a topic, built around a handful of
 * deck words. You read with tap-to-translate, then answer three to five gap
 * questions with the story out of sight. A deck word you tap counts as a
 * lapse of its recognition card; one you leave alone gets no rating, since
 * reading a word is weaker evidence than producing it. The gap questions
 * rate the production cards of the words they ask for.
 */

/** Deck words to ask the story for. */
export const STORY_TARGETS = 6;
/** Fewer deck words than this in the text and the story is not worth a slot. */
export const STORY_MIN_TARGETS = 3;
export const STORY_MIN_QUESTIONS = 3;
export const STORY_MAX_QUESTIONS = 5;
/** The prompt asks for 120 to 200 words; this is how far off a story may be and still be kept. */
export const STORY_MIN_WORDS = 90;
export const STORY_MAX_WORDS = 260;

export interface StoryTarget {
  itemId: number;
  /** The recognition card a tap counts against. */
  recognizeCardId: number | null;
  /** The production card a gap question rates. */
  produceCardId: number | null;
  /** As written on a card: "die Wohnung". */
  word: string;
  meaning: string;
  kind: ItemKind;
  /** The word as it stands in the text: "Wohnung", "Wohnungen", "zieht". */
  forms: string[];
}

export interface StoryQuestion extends GapExercise {
  /** Index into the story's targets: the word that fills the gap. */
  target: number;
}

/** A cached story, as stored in the exercise cache. */
export interface StoryExercise {
  title: string;
  /** Paragraphs, separated by a blank line. */
  text: string;
  /** English for the words outside your deck. */
  glosses: Gloss[];
  targets: StoryTarget[];
  questions: StoryQuestion[];
}

export interface StoryToken {
  text: string;
  /** English for a word outside your deck. */
  gloss?: string;
  /** Index into the targets, for one of your deck words. */
  target?: number;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The text as paragraphs of tokens, ready to be made tappable. Your deck
 * words point at their target; other words carry the gloss the LLM gave.
 */
export function storyParagraphs(
  story: Pick<StoryExercise, 'text' | 'glosses' | 'targets'>,
): StoryToken[][] {
  const glosses = new Map(story.glosses.map((g) => [glossKey(g.de), g.en.trim()]));
  const targets = new Map<string, number>();
  story.targets.forEach((t, i) => {
    for (const form of t.forms) {
      const key = glossKey(form);
      if (key && !targets.has(key)) targets.set(key, i);
    }
  });
  return story.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragraph) =>
      paragraph
        .split(/(\s+)/)
        .filter(Boolean)
        .map((part): StoryToken => {
          if (/^\s+$/.test(part)) return { text: ' ' };
          const key = glossKey(part);
          const target = targets.get(key);
          if (target !== undefined) return { text: part, target };
          const gloss = glosses.get(key);
          return gloss ? { text: part, gloss } : { text: part };
        }),
    );
}

/** The words of a text, as lookup keys. */
export function textKeys(text: string): Set<string> {
  return new Set(text.split(/\s+/).map(glossKey).filter(Boolean));
}

/** Grade one gap question like a gap fill: the form the sentence needs, endings included. */
export function gradeStoryQuestion(
  question: StoryQuestion,
  given: string,
  kind: ItemKind,
): ItemResult {
  const grade = gradeGapFill(question, given, kind);
  return {
    outcome: grade.outcome,
    slips: grade.slips,
    expected: grade.expected,
    mistake: grade.mistakes[0] ?? null,
  };
}

/** What one card gets from a story. */
export interface StoryCardOutcome {
  cardId: number;
  itemId: number;
  outcome: Outcome;
  mistakes: MistakeNote[];
  answer: string | null;
}

/**
 * The ratings a read story earns: a tapped deck word is a lapse of its
 * recognition card, and the gap questions on a word rate its production
 * card as a set. Untapped words that no question asked for get nothing.
 */
export function storyOutcomes(
  story: Pick<StoryExercise, 'targets' | 'questions'>,
  tapped: ReadonlySet<number>,
  answers: readonly (ItemResult & { answer: string })[],
): StoryCardOutcome[] {
  const outcomes: StoryCardOutcome[] = [];
  story.targets.forEach((target, i) => {
    if (tapped.has(i) && target.recognizeCardId !== null) {
      outcomes.push({
        cardId: target.recognizeCardId,
        itemId: target.itemId,
        outcome: 'revealed',
        mistakes: [],
        answer: null,
      });
    }
    const asked = story.questions.flatMap((q, qi) =>
      q.target === i && answers[qi] ? [answers[qi]] : [],
    );
    if (asked.length && target.produceCardId !== null) {
      outcomes.push({
        cardId: target.produceCardId,
        itemId: target.itemId,
        outcome: setOutcome(asked),
        mistakes: asked.flatMap((r) => (r.mistake ? [r.mistake] : [])),
        answer: asked.map((r) => r.answer).join(' | '),
      });
    }
  });
  return outcomes;
}
