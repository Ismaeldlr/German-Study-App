import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { ratingFor, type Grade } from '@/core/rating';
import {
  mistakesFor,
  targetOutcome,
  type TranslationExercise,
  type TranslationGrade,
} from '@/core/translation';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { card, pendingGrade, type PendingGradeRow } from '../schema';
import { recordReview, usualTimeFor } from './study';

/**
 * The pending-grading queue. A translation is saved here the moment you
 * answer; once the LLM grades it, each target card gets its review, logged
 * at the time you answered. Its cards stay out of the queue meanwhile.
 */

/** After this many unusable replies the answer is dropped, so its cards come back. */
export const MAX_GRADE_ATTEMPTS = 3;

export interface NewPendingGrade {
  exerciseId: number | null;
  exercise: TranslationExercise;
  answer: string;
  responseMs: number | null;
  answeredAt: number;
}

export function savePendingGrade(db: DbOrTx, input: NewPendingGrade): number {
  const [row] = db
    .insert(pendingGrade)
    .values({ ...input, answer: input.answer.trim() })
    .returning({ id: pendingGrade.id })
    .all();
  notifyChange('pending_grade');
  return row.id;
}

export function getPendingGrade(db: DbOrTx, id: number): PendingGradeRow | undefined {
  return db.select().from(pendingGrade).where(eq(pendingGrade.id, id)).get();
}

/** Answers still waiting, oldest first. */
export function waitingGrades(db: DbOrTx): PendingGradeRow[] {
  return db
    .select()
    .from(pendingGrade)
    .where(eq(pendingGrade.status, 'pending'))
    .orderBy(asc(pendingGrade.answeredAt), asc(pendingGrade.id))
    .all();
}

export interface AppliedRating {
  cardId: number;
  rating: Grade;
  nextDue: number;
}

/**
 * Rate each target card from the grade and mark the answer graded, all in
 * one transaction. Reviews are logged when you answered, or just after the
 * card's last review if that came later.
 */
export function applyGrade(
  db: DbOrTx,
  id: number,
  grade: TranslationGrade,
  now: number,
): AppliedRating[] {
  const row = getPendingGrade(db, id);
  if (!row || row.status !== 'pending') return [];
  const usualMs = usualTimeFor(db, 'produce', 'translation');
  const applied = db.transaction((tx) => {
    const results: AppliedRating[] = [];
    for (const target of grade.targets) {
      const current = tx.select().from(card).where(eq(card.id, target.cardId)).get();
      if (!current) continue;
      const outcome = targetOutcome(target.verdict);
      const rating = ratingFor({
        outcome,
        responseMs: row.responseMs,
        usualMs,
        cardState: current.state,
      });
      const at = Math.max(row.answeredAt, (current.lastReview ?? 0) + 1);
      const schedule = recordReview(
        tx,
        {
          cardId: current.id,
          rating,
          mode: 'translation',
          responseMs: row.responseMs,
          answer: row.answer,
          correct: outcome !== 'wrong',
          mistakes: mistakesFor(grade, target.itemId),
        },
        at,
      );
      results.push({ cardId: current.id, rating, nextDue: schedule.due });
    }
    tx.update(pendingGrade)
      .set({ status: 'graded', result: grade, gradedAt: now, lastError: null })
      .where(eq(pendingGrade.id, id))
      .run();
    return results;
  });
  notifyChange('pending_grade');
  return applied;
}

/**
 * Note a failed attempt. Only unusable replies count towards giving up; being
 * offline, out of budget or without a key just waits for the next try.
 */
export function recordGradeFailure(
  db: DbOrTx,
  id: number,
  error: string,
  countsAsAttempt: boolean,
): PendingGradeRow['status'] {
  const row = getPendingGrade(db, id);
  if (!row || row.status !== 'pending') return row?.status ?? 'failed';
  const attempts = row.attempts + (countsAsAttempt ? 1 : 0);
  const status = attempts >= MAX_GRADE_ATTEMPTS ? 'failed' : 'pending';
  db.update(pendingGrade)
    .set({ attempts, status, lastError: error })
    .where(eq(pendingGrade.id, id))
    .run();
  notifyChange('pending_grade');
  return status;
}

/** Graded answers you have not looked at yet, newest first. */
export function unseenGrades(db: DbOrTx): PendingGradeRow[] {
  return db
    .select()
    .from(pendingGrade)
    .where(and(eq(pendingGrade.status, 'graded'), isNull(pendingGrade.seenAt)))
    .orderBy(desc(pendingGrade.gradedAt), desc(pendingGrade.id))
    .all();
}

/** Graded answers, newest first, for the graded list. */
export function recentGrades(db: DbOrTx, limit = 30): PendingGradeRow[] {
  return db
    .select()
    .from(pendingGrade)
    .where(and(eq(pendingGrade.status, 'graded'), isNotNull(pendingGrade.result)))
    .orderBy(desc(pendingGrade.gradedAt), desc(pendingGrade.id))
    .limit(limit)
    .all();
}

export function markGradesSeen(db: DbOrTx, ids: readonly number[], now: number): void {
  if (ids.length === 0) return;
  db.update(pendingGrade)
    .set({ seenAt: now })
    .where(and(inArray(pendingGrade.id, [...ids]), isNull(pendingGrade.seenAt)))
    .run();
  notifyChange('pending_grade');
}
