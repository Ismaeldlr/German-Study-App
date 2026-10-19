import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type Grade as FsrsGrade,
} from 'ts-fsrs';

import { DAY_MS } from './time';
import type { Grade } from './rating';

/** The FSRS fields stored on each card row. Times are epoch milliseconds. */
export interface CardSchedule {
  state: number;
  stability: number;
  difficulty: number;
  due: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
}

export function newCardSchedule(now: number): CardSchedule {
  return fromFsrs(createEmptyCard(new Date(now)));
}

export interface SchedulerOptions {
  /** Target recall, 0.9 by default in settings. */
  targetRecall: number;
  /** Spread due dates a little so cards added together drift apart. Off in tests. */
  fuzz?: boolean;
}

export interface Scheduler {
  review(card: CardSchedule, grade: Grade, now: number): CardSchedule;
  /** Predicted chance of recalling the card at `now`. 0 for new cards. */
  retrievability(card: CardSchedule, now: number): number;
}

/** FSRS via ts-fsrs, the same algorithm Anki uses. */
export function createScheduler(options: SchedulerOptions): Scheduler {
  const f = fsrs(
    generatorParameters({
      request_retention: options.targetRecall,
      enable_fuzz: options.fuzz ?? true,
      enable_short_term: true,
    }),
  );
  return {
    review(card, grade, now) {
      const result = f.next(toFsrs(card, now), new Date(now), grade as FsrsGrade);
      return fromFsrs(result.card);
    },
    retrievability(card, now) {
      if (card.state === 0 || card.lastReview == null) return 0;
      return f.get_retrievability(toFsrs(card, now), new Date(now), false);
    },
  };
}

function toFsrs(card: CardSchedule, now: number): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days:
      card.lastReview == null ? 0 : Math.max(0, Math.floor((now - card.lastReview) / DAY_MS)),
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview == null ? undefined : new Date(card.lastReview),
  };
}

function fromFsrs(card: FsrsCard): CardSchedule {
  return {
    state: card.state,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.getTime(),
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}
