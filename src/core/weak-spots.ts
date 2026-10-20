import type { MistakeCategory } from './model';
import { DAY_MS } from './time';

/**
 * The weak-spot model. Each mistake category keeps a score: every mistake
 * adds one, and the score halves every 14 days without new errors. The top
 * category pulls its grammar items forward, so the app notices a pattern
 * of dative endings before you do.
 */

export const WEAK_SPOT_HALF_LIFE_DAYS = 14;
/** A category needs about two recent mistakes before it counts as a weak spot. */
export const WEAK_SPOT_MIN_SCORE = 1.5;

export interface MistakeSample {
  category: MistakeCategory;
  createdAt: number;
}

export interface WeakSpot {
  category: MistakeCategory;
  score: number;
  /** Mistakes in this category, all time. */
  count: number;
  lastAt: number;
}

/** Categories with any mistakes, highest score first. */
export function weakSpotScores(mistakes: readonly MistakeSample[], now: number): WeakSpot[] {
  const byCategory = new Map<MistakeCategory, WeakSpot>();
  for (const m of mistakes) {
    const ageDays = Math.max(0, now - m.createdAt) / DAY_MS;
    const weight = 0.5 ** (ageDays / WEAK_SPOT_HALF_LIFE_DAYS);
    const spot = byCategory.get(m.category) ?? {
      category: m.category,
      score: 0,
      count: 0,
      lastAt: 0,
    };
    spot.score += weight;
    spot.count += 1;
    spot.lastAt = Math.max(spot.lastAt, m.createdAt);
    byCategory.set(m.category, spot);
  }
  return [...byCategory.values()].sort((a, b) => b.score - a.score || b.lastAt - a.lastAt);
}

/** The category to work on next, or null when nothing stands out. */
export function topWeakSpot(spots: readonly WeakSpot[]): WeakSpot | null {
  const top = spots[0];
  return top && top.score >= WEAK_SPOT_MIN_SCORE ? top : null;
}
