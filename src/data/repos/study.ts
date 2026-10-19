import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import type { MistakeNote } from '@/core/grading';
import type { CardType, ExerciseMode } from '@/core/model';
import { newItemAllowance, RECALL_WINDOW_DAYS } from '@/core/planner';
import { buildQueue, SIBLING_CAP, type QueueCandidate, type QueueEntry } from '@/core/queue';
import { isRecalled, Rating, usualResponseMs, type Grade } from '@/core/rating';
import { createScheduler, type CardSchedule } from '@/core/scheduler';
import { DAY_MS, startOfLocalDay } from '@/core/time';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { card, item, mistake, review, studySession, type CardRow, type ItemRow } from '../schema';
import { getAllSettings } from './settings';

/** Active cards of active items, as the planner sees them. */
export function queueCandidates(db: DbOrTx): QueueCandidate[] {
  return db
    .select({
      cardId: card.id,
      itemId: card.itemId,
      type: card.type,
      state: card.state,
      stability: card.stability,
      due: card.due,
      itemCreatedAt: item.createdAt,
    })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(and(eq(item.status, 'active'), eq(card.suspended, false)))
    .all();
}

/** Items whose recognition card was first reviewed before today. */
export function unlockedItemIds(db: DbOrTx, now: Date): Set<number> {
  const rows = db
    .selectDistinct({ itemId: card.itemId })
    .from(review)
    .innerJoin(card, eq(review.cardId, card.id))
    .where(and(eq(card.type, 'recognize'), lt(review.reviewedAt, startOfLocalDay(now))))
    .all();
  return new Set(rows.map((r) => r.itemId));
}

/** New items met for the first time today. */
export function newItemsIntroducedToday(db: DbOrTx, now: Date): number {
  const rows = db
    .select({ itemId: card.itemId, first: sql<number>`min(${review.reviewedAt})` })
    .from(review)
    .innerJoin(card, eq(review.cardId, card.id))
    .where(eq(card.type, 'recognize'))
    .groupBy(card.itemId)
    .having(gte(sql`min(${review.reviewedAt})`, startOfLocalDay(now)))
    .all();
  return rows.length;
}

/** Unlocked sibling cards (gender, plural, production) first seen today. */
export function newSiblingCardsToday(db: DbOrTx, now: Date): number {
  return db
    .select({ cardId: card.id })
    .from(review)
    .innerJoin(card, eq(review.cardId, card.id))
    .where(ne(card.type, 'recognize'))
    .groupBy(card.id)
    .having(gte(sql`min(${review.reviewedAt})`, startOfLocalDay(now)))
    .all().length;
}

/** Review cards due before today that are still waiting. */
export function overdueCount(candidates: readonly QueueCandidate[], now: Date): number {
  const today = startOfLocalDay(now);
  return candidates.filter((c) => c.state !== CardState.New && c.due < today).length;
}

/** Graded answers over the last few days, for the new-item gate. */
export function recentRecall(db: DbOrTx, now: Date): { answers: number; recalled: number } {
  const rows = db
    .select({ rating: review.rating })
    .from(review)
    .where(gte(review.reviewedAt, now.getTime() - RECALL_WINDOW_DAYS * DAY_MS))
    .all();
  return { answers: rows.length, recalled: rows.filter((r) => isRecalled(r.rating)).length };
}

/** Today's adaptive new-item allowance, before subtracting what was introduced today. */
export function dailyAllowance(
  db: DbOrTx,
  now: Date,
  candidates: readonly QueueCandidate[] = queueCandidates(db),
): number {
  const settings = getAllSettings(db);
  return newItemAllowance({
    base: settings['study.newItemsBase'],
    max: settings['study.newItemsMax'],
    minRecall: settings['study.newItemsMinRecall'],
    overdue: overdueCount(candidates, now),
    recent: recentRecall(db, now),
  });
}

/**
 * Today's queue. Both daily limits count what was already done today, so a
 * second session the same day does not reset them.
 */
export function todayQueue(db: DbOrTx, now: Date): QueueEntry[] {
  const candidates = queueCandidates(db);
  return buildQueue(candidates, {
    now: now.getTime(),
    newItemsAllowance: dailyAllowance(db, now, candidates) - newItemsIntroducedToday(db, now),
    unlockedItemIds: unlockedItemIds(db, now),
    siblingCap: SIBLING_CAP - newSiblingCardsToday(db, now),
  });
}

export interface StudyCard {
  card: CardRow;
  item: ItemRow;
}

export function getStudyCard(db: DbOrTx, cardId: number): StudyCard | null {
  const row = db
    .select({ card, item })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(eq(card.id, cardId))
    .get();
  return row ?? null;
}

/** Items to draw multiple-choice distractors from. */
export function distractorPool(db: DbOrTx) {
  return db
    .select({ id: item.id, kind: item.kind, meanings: item.meanings })
    .from(item)
    .where(eq(item.status, 'active'))
    .all();
}

/** Median time of recent correct answers on this card type, or null with too few. */
export function usualTimeFor(db: DbOrTx, type: CardType, mode: ExerciseMode = 'classic') {
  const rows = db
    .select({ ms: review.responseMs })
    .from(review)
    .innerJoin(card, eq(review.cardId, card.id))
    .where(and(eq(card.type, type), eq(review.mode, mode), gte(review.rating, Rating.Good)))
    .orderBy(desc(review.reviewedAt))
    .limit(20)
    .all();
  return usualResponseMs(rows.map((r) => r.ms ?? 0));
}

export interface ReviewInput {
  cardId: number;
  rating: Grade;
  mode: ExerciseMode;
  responseMs: number | null;
  answer: string | null;
  correct: boolean;
  mistakes?: MistakeNote[];
}

/**
 * Grade a card: update its FSRS state and log the review (and any mistakes)
 * in a single transaction, written the moment you answer.
 */
export function recordReview(db: DbOrTx, input: ReviewInput, now: number): CardSchedule {
  const targetRecall = getAllSettings(db)['study.targetRecall'];
  const scheduler = createScheduler({ targetRecall });
  const next = db.transaction((tx) => {
    const current = tx.select().from(card).where(eq(card.id, input.cardId)).get();
    if (!current) throw new Error(`Card ${input.cardId} not found`);
    const schedule = scheduler.review(current, input.rating, now);
    tx.update(card).set(schedule).where(eq(card.id, current.id)).run();
    const [logged] = tx
      .insert(review)
      .values({
        cardId: current.id,
        reviewedAt: now,
        rating: input.rating,
        mode: input.mode,
        responseMs: input.responseMs,
        answer: input.answer,
        correct: input.correct,
        stateBefore: current.state,
      })
      .returning({ id: review.id })
      .all();
    for (const note of input.mistakes ?? []) {
      tx.insert(mistake)
        .values({
          reviewId: logged.id,
          itemId: current.itemId,
          category: note.category,
          yourText: note.yourText,
          correction: note.correction,
          explanation: note.explanation,
          createdAt: now,
        })
        .run();
    }
    return schedule;
  });
  notifyChange('card', 'review', 'mistake');
  return next;
}

export function startStudySession(db: DbOrTx, now: number): number {
  const [row] = db
    .insert(studySession)
    .values({ startedAt: now })
    .returning({ id: studySession.id })
    .all();
  notifyChange('session');
  return row.id;
}

export function finishStudySession(
  db: DbOrTx,
  id: number,
  result: { cardsDone: number; newItems: number; accuracy: number | null },
  now: number,
): void {
  db.update(studySession)
    .set({ endedAt: now, ...result })
    .where(eq(studySession.id, id))
    .run();
  notifyChange('session');
}
