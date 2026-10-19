import { CardState } from './cards';

/** FSRS ratings. */
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Grade = (typeof Rating)[keyof typeof Rating];

export type Outcome = 'correct' | 'slip' | 'wrong' | 'skipped' | 'revealed';

/**
 * "Faster than your usual time" means clearly faster: under this share of
 * the median. Comparing against the median itself would rate about half of
 * all correct answers Easy and stretch intervals too far.
 */
export const EASY_SPEED_FACTOR = 0.75;
/** Fewer correct answers than this and there is no usual time yet. */
export const MIN_SPEED_SAMPLES = 5;

export interface RatingInput {
  outcome: Outcome;
  usedHint?: boolean;
  responseMs?: number | null;
  /** The usual response time for this card type, from `usualResponseMs`. */
  usualMs?: number | null;
  cardState: number;
}

/**
 * Turn what happened into an FSRS rating, so you never grade yourself:
 * wrong, skipped or revealed is Again; right after a hint or with a small
 * slip is Hard; right is Good; right and fast on a review card is Easy.
 */
export function ratingFor(input: RatingInput): Grade {
  switch (input.outcome) {
    case 'wrong':
    case 'skipped':
    case 'revealed':
      return Rating.Again;
    case 'slip':
      return Rating.Hard;
    case 'correct':
      if (input.usedHint) return Rating.Hard;
      if (
        input.cardState === CardState.Review &&
        input.responseMs != null &&
        input.usualMs != null &&
        input.responseMs < input.usualMs * EASY_SPEED_FACTOR
      ) {
        return Rating.Easy;
      }
      return Rating.Good;
  }
}

/** Median of recent correct response times, or null with too few samples. */
export function usualResponseMs(samples: readonly number[]): number | null {
  const valid = samples.filter((ms) => Number.isFinite(ms) && ms > 0);
  if (valid.length < MIN_SPEED_SAMPLES) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Whether a rating counts as remembering, for recall stats. */
export function isRecalled(rating: number): boolean {
  return rating >= Rating.Hard;
}
