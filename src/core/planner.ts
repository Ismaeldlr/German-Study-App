import { CardState, MATURE_STABILITY_DAYS } from './cards';
import type { CardType } from './model';
import type { Scheduler, CardSchedule } from './scheduler';
import { DAY_MS } from './time';

/**
 * The daily planner's rules: how many new items today, which cards are at
 * risk of being forgotten, and how each card should be practised.
 */

/** Every this many overdue cards cost one new item. */
export const OVERDUE_STEP = 10;
export const RECALL_WINDOW_DAYS = 3;
/** Fewer graded answers than this in the window and recall does not gate new items. */
export const MIN_RECALL_SAMPLES = 10;

export interface AllowanceInput {
  base: number;
  max: number;
  minRecall: number;
  /** Review cards due before today and still not reviewed. */
  overdue: number;
  /** Graded answers in the last RECALL_WINDOW_DAYS days. */
  recent: { answers: number; recalled: number };
}

/**
 * Starts at the base, drops by one for every OVERDUE_STEP overdue cards,
 * stays between 0 and the max, and is 0 while recent recall is below the
 * floor: adding words to a pile you are failing makes both worse.
 */
export function newItemAllowance(input: AllowanceInput): number {
  const { answers, recalled } = input.recent;
  if (answers >= MIN_RECALL_SAMPLES && recalled / answers < input.minRecall) return 0;
  const allowance = input.base - Math.floor(input.overdue / OVERDUE_STEP);
  return Math.max(0, Math.min(input.max, allowance));
}

export const AT_RISK_RECALL = 0.85;
export const AT_RISK_DAYS = 3;

/**
 * A review card not due yet whose predicted recall drops below 85% within
 * three days. It gets no review, but its word appears as a support word in
 * generated sentences, which refreshes it in context.
 */
export function isAtRisk(card: CardSchedule, now: number, scheduler: Scheduler): boolean {
  if (card.state !== CardState.Review || card.due <= now) return false;
  return scheduler.retrievability(card, now + AT_RISK_DAYS * DAY_MS) < AT_RISK_RECALL;
}

export type PracticeMode = 'classic' | 'gap_fill' | 'translation' | 'grammar_drill';

/**
 * How a card is practised, by type and maturity. Production cards move to
 * gap fill while learning or young, and to translation once mature.
 * Grammar cards are drilled. The other types are classic cards by nature.
 */
export function practiceMode(card: {
  type: CardType;
  state: number;
  stability: number;
}): PracticeMode {
  if (card.type === 'apply_grammar') return 'grammar_drill';
  if (card.type !== 'produce') return 'classic';
  if (card.state === CardState.Review && card.stability >= MATURE_STABILITY_DAYS) {
    return 'translation';
  }
  return 'gap_fill';
}
