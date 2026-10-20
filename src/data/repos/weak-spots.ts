import { desc, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import type { MistakeCategory } from '@/core/model';
import { topWeakSpot, weakSpotScores, type MistakeSample, type WeakSpot } from '@/core/weak-spots';

import type { DbOrTx } from '../db';
import { card, item, mistake, review } from '../schema';
import { grammarForCategory } from './grammar';

/**
 * Mistakes that count towards weak spots. Picking the wrong meaning on a
 * recognition card is a memory gap, not an error a teacher would correct,
 * so those stay out; everything you produced counts.
 */
export function weakSpotMistakes(db: DbOrTx): MistakeSample[] {
  return db
    .select({ category: mistake.category, createdAt: mistake.createdAt, cardType: card.type })
    .from(mistake)
    .leftJoin(review, eq(mistake.reviewId, review.id))
    .leftJoin(card, eq(review.cardId, card.id))
    .all()
    .filter((m) => m.cardType !== 'recognize')
    .map(({ category, createdAt }) => ({ category, createdAt }));
}

export function weakSpots(db: DbOrTx, now: Date): WeakSpot[] {
  return weakSpotScores(weakSpotMistakes(db), now.getTime());
}

export interface MistakeExample {
  id: number;
  lemma: string | null;
  yourText: string;
  correction: string;
  explanation: string | null;
  createdAt: number;
}

/** Your latest mistakes in a category, for the weak-spot list. */
export function weakSpotExamples(
  db: DbOrTx,
  category: MistakeCategory,
  limit = 3,
): MistakeExample[] {
  return db
    .select({
      id: mistake.id,
      lemma: item.lemma,
      yourText: mistake.yourText,
      correction: mistake.correction,
      explanation: mistake.explanation,
      createdAt: mistake.createdAt,
      cardType: card.type,
    })
    .from(mistake)
    .leftJoin(item, eq(mistake.itemId, item.id))
    .leftJoin(review, eq(mistake.reviewId, review.id))
    .leftJoin(card, eq(review.cardId, card.id))
    .where(eq(mistake.category, category))
    .orderBy(desc(mistake.createdAt), desc(mistake.id))
    .all()
    .filter((m) => m.cardType !== 'recognize')
    .slice(0, limit)
    .map(({ cardType: _, ...m }) => m);
}

/**
 * The grammar item your top weak spot pulls forward: one about that
 * category that has been drilled before, soonest due first. Empty when
 * nothing stands out or no grammar item covers it.
 */
export function pullForwardGrammar(db: DbOrTx, now: Date): Set<number> {
  const top = topWeakSpot(weakSpots(db, now));
  if (!top) return new Set();
  const candidate = grammarForCategory(db, top.category)
    .filter((r) => r.card.state !== CardState.New)
    .sort((a, b) => a.card.due - b.card.due)[0];
  return new Set(candidate ? [candidate.item.id] : []);
}
