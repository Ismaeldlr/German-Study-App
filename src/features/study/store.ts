import { create } from 'zustand';

import type { SlipKind } from '@/core/answers';
import type { ContrastSet, GrammarDrill } from '@/core/drills';
import type { GapExercise, GapHint } from '@/core/gap-fill';
import type { MistakeNote } from '@/core/grading';
import type { CardType } from '@/core/model';
import type { QueueEntry } from '@/core/queue';
import type { Grade } from '@/core/rating';
import {
  deferAnswer,
  dropCards,
  nextEntry,
  recordAnswer,
  startSession,
  type SessionState,
} from '@/core/session';
import { localDay } from '@/core/time';
import type { TranslationExercise, TranslationGrade } from '@/core/translation';

/**
 * UI state for the running session. The database stays the source of
 * truth: every answer is written there the moment it is given, and this
 * store only remembers where in the session you are.
 */

export type Phase = 'idle' | 'empty' | 'intro' | 'question' | 'grading' | 'feedback' | 'done';

/**
 * How the current card is asked: as a classic card, or with a cached
 * exercise. `skip` means it cannot be asked right now (a grammar card back
 * from a learning step with no drill left) and the session moves on.
 */
export type Presentation =
  | { mode: 'classic' }
  | { mode: 'gap_fill'; exerciseId: number; exercise: GapExercise; hint: GapHint }
  | { mode: 'translation'; exerciseId: number; exercise: TranslationExercise }
  | { mode: 'grammar_drill'; exerciseId: number; drill: GrammarDrill }
  | { mode: 'contrast'; exerciseId: number; set: ContrastSet }
  | { mode: 'skip' };

const CLASSIC: Presentation = { mode: 'classic' };

export interface Feedback {
  /** `pending`: saved for grading later, no rating yet. */
  outcome: 'correct' | 'slip' | 'wrong' | 'revealed' | 'pending';
  expected: string;
  given: string | null;
  rating: Grade | null;
  slips: SlipKind[];
  mistakes: MistakeNote[];
  /** The sentence the answer belongs in, for gap fills. */
  context?: { de: string; en: string } | null;
  /** For exercises that rate several cards: one line per card. */
  ratings?: { label: string; rating: Grade }[];
  /** The LLM's grade, for translations. */
  translation?: TranslationGrade | null;
  /** An explanation for the whole exercise, such as how two words differ. */
  note?: string | null;
  /** The item's memory hook, shown when you got it wrong. */
  hook?: string | null;
  /** XP this answer earned. */
  xp?: number;
}

/** One card's new schedule after an answer. */
export interface AnswerResult {
  cardId: number;
  itemId: number;
  type: CardType;
  rating: Grade;
  nextDue: number;
}

export interface SessionMistake extends MistakeNote {
  lemma: string;
}

/** Where you stood when the session began, so the summary can show what changed. */
export interface Baseline {
  totalXp: number;
  todayXp: number;
  level: number;
  streak: number;
  activeToday: boolean;
  badges: string[];
}

interface StudyStore {
  sessionId: number | null;
  /** Local day the session started, so an unfinished one is not resumed tomorrow. */
  day: string | null;
  session: SessionState | null;
  entry: QueueEntry | null;
  presentation: Presentation;
  phase: Phase;
  shownAt: number;
  feedback: Feedback | null;
  mistakes: SessionMistake[];
  /** The waiting answer being graded while you watch. */
  gradingId: number | null;
  /** XP earned this session. */
  xp: number;
  /** Answers remembered in a row, and the longest run this session. */
  combo: number;
  bestCombo: number;
  baseline: Baseline | null;
  present: (entry: QueueEntry) => Presentation;
  begin(
    sessionId: number,
    queue: QueueEntry[],
    now: number,
    options?: {
      deadline?: number | null;
      present?: (entry: QueueEntry) => Presentation;
      baseline?: Baseline | null;
    },
  ): void;
  empty(): void;
  next(now: number): void;
  showQuestion(now: number): void;
  /** Ask the current card as a classic card instead, after a bad sentence. */
  useClassic(now: number): void;
  /**
   * Record an answer. `results` holds every card it rated: the current one,
   * and others an exercise rated with it, which leave the rest of the session.
   */
  answered(feedback: Feedback, results: AnswerResult[], lemma: string, now: number): void;
  grading(id: number): void;
  /**
   * The answer waits for grading: no rating now, so the card does not come
   * back. Neither do the other cards a translation practises, since the
   * grade rates them all once it lands.
   */
  deferred(feedback: Feedback): void;
  finish(): void;
  reset(): void;
}

const initial = {
  sessionId: null,
  day: null,
  session: null,
  entry: null,
  presentation: CLASSIC,
  phase: 'idle' as Phase,
  shownAt: 0,
  feedback: null,
  mistakes: [],
  gradingId: null,
  xp: 0,
  combo: 0,
  bestCombo: 0,
  baseline: null,
  present: () => CLASSIC,
};

export const useStudyStore = create<StudyStore>((set, get) => ({
  ...initial,
  begin(sessionId, queue, now, options = {}) {
    set({
      ...initial,
      sessionId,
      day: localDay(new Date(now)),
      session: startSession(queue, options.deadline ?? null),
      present: options.present ?? (() => CLASSIC),
      baseline: options.baseline ?? null,
    });
    get().next(now);
  },
  empty() {
    set({ ...initial, phase: 'empty' });
  },
  next(now) {
    const { present } = get();
    let session = get().session;
    if (!session) return;
    for (;;) {
      const step = nextEntry(session, now);
      if (!step.entry) {
        set({ session: step.state, entry: null, feedback: null, gradingId: null, phase: 'done' });
        return;
      }
      const presentation = present(step.entry);
      if (presentation.mode === 'skip') {
        session = step.state;
        continue;
      }
      const intro = step.entry.kind === 'new_item';
      set({
        session: step.state,
        entry: step.entry,
        presentation,
        feedback: null,
        gradingId: null,
        phase: intro ? 'intro' : 'question',
        shownAt: now,
      });
      return;
    }
  },
  showQuestion(now) {
    set({ phase: 'question', shownAt: now });
  },
  useClassic(now) {
    set({ presentation: CLASSIC, phase: 'question', shownAt: now });
  },
  answered(feedback, results, lemma, now) {
    const { session, entry, mistakes, combo, bestCombo, xp } = get();
    if (!session || !entry) return;
    const others = results.filter((r) => r.cardId !== entry.cardId);
    let next = dropCards(
      session,
      others.map((r) => r.cardId),
    );
    for (const result of results) {
      const answeredEntry: QueueEntry =
        result.cardId === entry.cardId
          ? entry
          : {
              cardId: result.cardId,
              itemId: result.itemId,
              type: result.type,
              kind: 'review',
              mode: 'classic',
            };
      next = recordAnswer(next, answeredEntry, result, now);
    }
    const remembered = feedback.outcome === 'correct' || feedback.outcome === 'slip';
    const nextCombo = remembered ? combo + 1 : 0;
    set({
      session: next,
      feedback,
      gradingId: null,
      phase: 'feedback',
      mistakes: [...mistakes, ...feedback.mistakes.map((m) => ({ ...m, lemma }))],
      xp: xp + (feedback.xp ?? 0),
      combo: nextCombo,
      bestCombo: Math.max(bestCombo, nextCombo),
    });
  },
  grading(id) {
    set({ phase: 'grading', gradingId: id });
  },
  deferred(feedback) {
    const { session, presentation } = get();
    if (!session) return;
    const targets =
      presentation.mode === 'translation' ? presentation.exercise.targets.map((t) => t.cardId) : [];
    set({
      session: deferAnswer(dropCards(session, targets)),
      feedback,
      gradingId: null,
      phase: 'feedback',
    });
  },
  finish() {
    set({ phase: 'done', entry: null, feedback: null, gradingId: null });
  },
  reset() {
    set(initial);
  },
}));
