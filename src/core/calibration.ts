import { CardState } from './cards';
import type { Grade } from './rating';
import { isRecalled } from './rating';
import { createScheduler, newCardSchedule, type CardSchedule } from './scheduler';

/**
 * Is the scheduler right about you? Each card's reviews are replayed
 * through FSRS, and before every review of a card in review we ask how
 * likely it predicted you were to remember. Grouped by that prediction,
 * the share you actually remembered should match it. If it is well below,
 * the default FSRS parameters are too optimistic for you, and a refit
 * from the review log would help.
 */

export interface ReplayReview {
  cardId: number;
  reviewedAt: number;
  rating: number;
}

export interface CalibrationBucket {
  /** Predicted recall from (inclusive) to (exclusive). */
  from: number;
  to: number;
  answers: number;
  /** Mean predicted recall of the answers in the bucket. */
  predicted: number;
  /** Share actually remembered. */
  actual: number;
}

export const CALIBRATION_EDGES = [0, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0001] as const;

export function calibration(
  reviews: readonly ReplayReview[],
  edges: readonly number[] = CALIBRATION_EDGES,
): CalibrationBucket[] {
  // Target recall only moves due dates, never the memory state, so any target replays the same.
  const scheduler = createScheduler({ targetRecall: 0.9, fuzz: false });
  const byCard = new Map<number, ReplayReview[]>();
  for (const r of reviews) byCard.set(r.cardId, [...(byCard.get(r.cardId) ?? []), r]);

  const sums = edges.slice(1).map(() => ({ answers: 0, predicted: 0, recalled: 0 }));
  for (const history of byCard.values()) {
    history.sort((a, b) => a.reviewedAt - b.reviewedAt);
    let card: CardSchedule = newCardSchedule(history[0].reviewedAt);
    for (const review of history) {
      if (card.state === CardState.Review) {
        const predicted = scheduler.retrievability(card, review.reviewedAt);
        const i = edges.findIndex((edge, k) => k > 0 && predicted < edge) - 1;
        if (i >= 0) {
          sums[i].answers++;
          sums[i].predicted += predicted;
          sums[i].recalled += isRecalled(review.rating) ? 1 : 0;
        }
      }
      card = scheduler.review(card, review.rating as Grade, review.reviewedAt);
    }
  }
  return sums.map((s, i) => ({
    from: edges[i],
    to: edges[i + 1],
    answers: s.answers,
    predicted: s.answers ? s.predicted / s.answers : 0,
    actual: s.answers ? s.recalled / s.answers : 0,
  }));
}
