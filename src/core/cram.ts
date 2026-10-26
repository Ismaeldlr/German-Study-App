import { CardState } from './cards';
import type { CardType } from './model';

/**
 * Cram mode: some chapters and an exam date. While it runs, those chapters'
 * cards are scheduled at a higher target recall, and pulled forward so each
 * one is reviewed on at least two different days before the exam. The work
 * is spread over the days left, so it does not all land on the last night.
 */

/** Days each card is reviewed on before the exam. */
export const CRAM_REVIEWS = 2;
/** Target recall for cram cards, unless your usual target is higher. */
export const CRAM_RECALL = 0.95;
/** How far ahead the exam can be, so a typo cannot start a year-long cram. */
export const CRAM_MAX_DAYS = 90;

export interface CramPlan {
  chapterIds: number[];
  /** The exam's local day, YYYY-MM-DD. */
  examDay: string;
  /** When cram mode started: reviews from then on count. */
  startedAt: number;
}

function dayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole days from one local day to another. */
export function daysBetween(from: string, to: string): number {
  return dayIndex(to) - dayIndex(from);
}

/**
 * Study days left: today counts and the exam day does not. On the exam day
 * itself it is 1, since there is still the morning.
 */
export function cramDaysLeft(today: string, examDay: string): number {
  return Math.max(1, daysBetween(today, examDay));
}

/** Cram mode runs until the exam day is over. */
export function isCramActive(plan: CramPlan | null, today: string): plan is CramPlan {
  return plan !== null && today <= plan.examDay;
}

export interface CramCard {
  cardId: number;
  itemId: number;
  type: CardType;
  state: number;
  due: number;
  /** Days with a review of this card since cram mode started, today left out. */
  daysReviewed: number;
  reviewedToday: boolean;
  /**
   * Whether the card can be asked today. A gender or plural card waits
   * until the day after its word is introduced, and a grammar card needs a
   * drill ready.
   */
  available: boolean;
}

export interface CramPicks {
  /** Review cards to ask today even though they are not due. */
  pull: Set<number>;
  /** New cards to introduce today, ahead of other new words. */
  introduce: Set<number>;
  /** Cram cards for today, those done already included. */
  quota: number;
  doneToday: number;
  daysLeft: number;
  cards: number;
  /** Cards reviewed on enough days already. */
  ready: number;
}

/**
 * Today's cram work. Every card owes CRAM_REVIEWS review days, and today
 * takes an even share of what was still owed when it began. Cards due
 * anyway come first, since they cost no extra; then cards that need a
 * review on every day left; then first reviews before second ones, so each
 * card has time for both; then the soonest due.
 */
export function cramPicks(
  cards: readonly CramCard[],
  options: { today: string; examDay: string; now: number },
): CramPicks {
  const daysLeft = cramDaysLeft(options.today, options.examDay);
  const owed = (c: CramCard) => Math.max(0, CRAM_REVIEWS - c.daysReviewed);
  const backlog = cards.reduce((sum, c) => sum + owed(c), 0);
  const quota = Math.ceil(backlog / daysLeft);
  const doneToday = cards.filter((c) => c.reviewedToday && owed(c) > 0).length;
  const ready = cards.filter((c) => c.daysReviewed + (c.reviewedToday ? 1 : 0) >= CRAM_REVIEWS);

  const isDue = (c: CramCard) => c.state !== CardState.New && c.due <= options.now;
  const urgent = (c: CramCard) => owed(c) >= daysLeft;
  const open = cards
    .filter((c) => owed(c) > 0 && !c.reviewedToday && c.available)
    .sort(
      (a, b) =>
        Number(isDue(b)) - Number(isDue(a)) ||
        Number(urgent(b)) - Number(urgent(a)) ||
        owed(b) - owed(a) ||
        a.due - b.due ||
        a.cardId - b.cardId,
    );
  const room = Math.max(0, quota - doneToday);
  const picked = open.filter((c, i) => i < room || urgent(c));

  return {
    pull: new Set(picked.filter((c) => c.state !== CardState.New).map((c) => c.cardId)),
    introduce: new Set(picked.filter((c) => c.state === CardState.New).map((c) => c.cardId)),
    quota,
    doneToday,
    daysLeft,
    cards: cards.length,
    ready: ready.length,
  };
}

/** Cram work left today. */
export function cramLeftToday(picks: Pick<CramPicks, 'pull' | 'introduce'>): number {
  return picks.pull.size + picks.introduce.size;
}

/** The target recall a card is scheduled at: higher while it is being crammed. */
export function cramRecall(usual: number, crammed: boolean): number {
  return crammed ? Math.max(usual, CRAM_RECALL) : usual;
}
