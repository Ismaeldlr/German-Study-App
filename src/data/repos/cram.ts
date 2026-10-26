import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { isCramActive, type CramCard, type CramPlan } from '@/core/cram';
import { localDay, startOfLocalDay } from '@/core/time';

import type { DbOrTx } from '../db';
import { card, item, review } from '../schema';
import { coverage } from './exercises';
import { getSetting, setSetting } from './settings';

/**
 * Cram mode's plan lives in settings, so a backup carries it. Today's picks
 * come from `todayCram` in the study repository, next to the queue they
 * feed.
 */

export function getCramPlan(db: DbOrTx): CramPlan | null {
  return getSetting(db, 'study.cram');
}

/** The plan, while its exam is today or still ahead. */
export function activeCram(db: DbOrTx, now: Date): CramPlan | null {
  const plan = getCramPlan(db);
  return isCramActive(plan, localDay(now)) ? plan : null;
}

export function startCram(
  db: DbOrTx,
  input: { chapterIds: readonly number[]; examDay: string },
  now: number,
): void {
  setSetting(db, 'study.cram', {
    chapterIds: [...new Set(input.chapterIds)],
    examDay: input.examDay,
    startedAt: now,
  });
}

export function endCram(db: DbOrTx): void {
  setSetting(db, 'study.cram', null);
}

/** Whether an item is in a chapter being crammed at `now`. */
export function isCrammed(db: DbOrTx, itemId: number, now: number): boolean {
  const plan = activeCram(db, new Date(now));
  if (!plan) return false;
  const row = db.select({ chapterId: item.chapterId }).from(item).where(eq(item.id, itemId)).get();
  return row?.chapterId != null && plan.chapterIds.includes(row.chapterId);
}

const reviewDay = sql`strftime('%Y-%m-%d', ${review.reviewedAt} / 1000, 'unixepoch', 'localtime')`;

/**
 * The plan's cards: every active card of an active item in its chapters,
 * with the days it was reviewed on since cram mode started. `unlocked` are
 * the items whose word was introduced before today, so their other cards
 * can be asked; cards in `waiting` have an answer waiting to be graded.
 */
export function cramCards(
  db: DbOrTx,
  plan: CramPlan,
  now: Date,
  context: { unlocked: ReadonlySet<number>; waiting: ReadonlySet<number> },
): CramCard[] {
  const rows = db
    .select({
      cardId: card.id,
      itemId: card.itemId,
      type: card.type,
      state: card.state,
      due: card.due,
    })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(
      and(
        eq(item.status, 'active'),
        eq(card.suspended, false),
        inArray(item.chapterId, plan.chapterIds),
      ),
    )
    .all();
  if (rows.length === 0) return [];
  const today = startOfLocalDay(now);
  const ids = rows.map((r) => r.cardId);
  const days = new Map(
    db
      .select({ cardId: review.cardId, days: sql<number>`count(distinct ${reviewDay})` })
      .from(review)
      .where(
        and(
          inArray(review.cardId, ids),
          gte(review.reviewedAt, plan.startedAt),
          lt(review.reviewedAt, today),
        ),
      )
      .groupBy(review.cardId)
      .all()
      .map((r) => [r.cardId, r.days]),
  );
  const reviewedToday = new Set(
    db
      .selectDistinct({ cardId: review.cardId })
      .from(review)
      .where(and(inArray(review.cardId, ids), gte(review.reviewedAt, today)))
      .all()
      .map((r) => r.cardId),
  );
  const drillReady = coverage(db, 'grammar_drill');
  return rows.map((r) => ({
    ...r,
    daysReviewed: days.get(r.cardId) ?? 0,
    reviewedToday: reviewedToday.has(r.cardId),
    available:
      !context.waiting.has(r.cardId) &&
      (r.type === 'apply_grammar'
        ? Boolean(drillReady.get(r.itemId))
        : r.type === 'recognize' || r.state !== CardState.New || context.unlocked.has(r.itemId)),
  }));
}
