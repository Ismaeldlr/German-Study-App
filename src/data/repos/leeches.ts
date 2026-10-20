import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { confusedPairs, type ConfusedPair } from '@/core/leeches';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { card, item, mistake, type CardRow, type ItemRow } from '../schema';

/** Leeches, memory hooks and the word pairs you mix up. */

export interface Leech {
  card: CardRow;
  item: ItemRow;
}

/** Flagged cards still in play, newest flag first. */
export function listLeeches(db: DbOrTx): Leech[] {
  return db
    .select({ card, item })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(and(isNotNull(card.leechAt), eq(card.suspended, false), eq(item.status, 'active')))
    .orderBy(desc(card.leechAt), desc(card.id))
    .all();
}

/** Keep studying the card as it is. It is flagged again if it keeps lapsing. */
export function dismissLeech(db: DbOrTx, cardId: number): void {
  db.update(card).set({ leechAt: null }).where(eq(card.id, cardId)).run();
  notifyChange('card');
}

/** Suspend a leech; its history stays. */
export function suspendLeech(db: DbOrTx, cardId: number): void {
  db.update(card).set({ suspended: true, leechAt: null }).where(eq(card.id, cardId)).run();
  notifyChange('card');
}

export function setMemoryHook(db: DbOrTx, itemId: number, hook: string | null, now: number): void {
  db.update(item)
    .set({ memoryHook: hook?.trim() || null, updatedAt: now })
    .where(eq(item.id, itemId))
    .run();
  notifyChange('item');
}

/** What you answered when you got an item wrong, newest first. */
export function wrongAnswersFor(db: DbOrTx, itemId: number, limit = 5): string[] {
  return [
    ...new Set(
      db
        .select({ text: mistake.yourText })
        .from(mistake)
        .where(eq(mistake.itemId, itemId))
        .orderBy(desc(mistake.createdAt), desc(mistake.id))
        .limit(limit * 2)
        .all()
        .map((m) => m.text.trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

/** The deck items an item gets confused with, most often first. */
export function confusedWithIds(db: DbOrTx, itemId: number): number[] {
  return confusedPairs(confusionMistakes(db), 1)
    .filter((p) => p.itemIds.includes(itemId))
    .map((p) => (p.itemIds[0] === itemId ? p.itemIds[1] : p.itemIds[0]));
}

/** Confused pairs where both words are still active in the deck. */
export function confusedPairsInDeck(db: DbOrTx): ConfusedPair[] {
  const active = new Set(
    db
      .select({ id: item.id })
      .from(item)
      .where(eq(item.status, 'active'))
      .all()
      .map((r) => r.id),
  );
  return confusedPairs(confusionMistakes(db)).filter((p) =>
    p.itemIds.every((id) => active.has(id)),
  );
}

function confusionMistakes(db: DbOrTx) {
  return db
    .select({
      itemId: mistake.itemId,
      confusedItemId: mistake.confusedItemId,
      createdAt: mistake.createdAt,
    })
    .from(mistake)
    .where(isNotNull(mistake.confusedItemId))
    .all();
}
