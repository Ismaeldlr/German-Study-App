import { create } from 'zustand';

import type { SlipKind } from '@/core/answers';
import type { GapExercise, GapHint } from '@/core/gap-fill';
import type { MistakeNote } from '@/core/grading';
import type { QueueEntry } from '@/core/queue';
import type { Grade } from '@/core/rating';
import { nextEntry, recordAnswer, startSession, type SessionState } from '@/core/session';
import { localDay } from '@/core/time';

/**
 * UI state for the running session. The database stays the source of
 * truth: every answer is written there the moment it is given, and this
 * store only remembers where in the session you are.
 */

export type Phase = 'idle' | 'empty' | 'intro' | 'question' | 'feedback' | 'done';

/** How the current card is asked: as a classic card, or in a cached gap sentence. */
export type Presentation =
  | { mode: 'classic' }
  | { mode: 'gap_fill'; exerciseId: number; exercise: GapExercise; hint: GapHint };

const CLASSIC: Presentation = { mode: 'classic' };

export interface Feedback {
  outcome: 'correct' | 'slip' | 'wrong' | 'revealed';
  expected: string;
  given: string | null;
  rating: Grade;
  slips: SlipKind[];
  mistakes: MistakeNote[];
  /** The sentence the answer belongs in, for gap fills. */
  context?: { de: string; en: string } | null;
}

export interface SessionMistake extends MistakeNote {
  lemma: string;
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
  present: (entry: QueueEntry) => Presentation;
  begin(
    sessionId: number,
    queue: QueueEntry[],
    now: number,
    options?: { deadline?: number | null; present?: (entry: QueueEntry) => Presentation },
  ): void;
  empty(): void;
  next(now: number): void;
  showQuestion(now: number): void;
  /** Ask the current card as a classic card instead, after a bad sentence. */
  useClassic(now: number): void;
  answered(feedback: Feedback, nextDue: number, lemma: string, now: number): void;
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
    });
    get().next(now);
  },
  empty() {
    set({ ...initial, phase: 'empty' });
  },
  next(now) {
    const { session, present } = get();
    if (!session) return;
    const step = nextEntry(session, now);
    if (!step.entry) {
      set({ session: step.state, entry: null, feedback: null, phase: 'done' });
      return;
    }
    const intro = step.entry.kind === 'new_item';
    set({
      session: step.state,
      entry: step.entry,
      presentation: intro ? CLASSIC : present(step.entry),
      feedback: null,
      phase: intro ? 'intro' : 'question',
      shownAt: now,
    });
  },
  showQuestion(now) {
    set({ phase: 'question', shownAt: now });
  },
  useClassic(now) {
    set({ presentation: CLASSIC, phase: 'question', shownAt: now });
  },
  answered(feedback, nextDue, lemma, now) {
    const { session, entry, mistakes } = get();
    if (!session || !entry) return;
    set({
      session: recordAnswer(session, entry, { rating: feedback.rating, nextDue }, now),
      feedback,
      phase: 'feedback',
      mistakes: [...mistakes, ...feedback.mistakes.map((m) => ({ ...m, lemma }))],
    });
  },
  finish() {
    set({ phase: 'done', entry: null, feedback: null });
  },
  reset() {
    set(initial);
  },
}));
