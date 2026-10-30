import { and, desc, eq, gte, inArray, lt, ne, notInArray, sql } from 'drizzle-orm';

import { CardState, displayLemma } from '@/core/cards';
import type { MistakeNote } from '@/core/grading';
import { cramPicks, cramRecall, type CramPicks } from '@/core/cram';
import { confusedWith, isLeechLapse } from '@/core/leeches';
import type { CardType, ExerciseMode, MistakeCategory } from '@/core/model';
import { newItemAllowance, practiceMode, RECALL_WINDOW_DAYS } from '@/core/planner';
import {
  buildQueue,
  SIBLING_CAP,
  spaceSiblings,
  summarizeQueue,
  type QueueCandidate,
  type QueueEntry,
} from '@/core/queue';
import type { ReminderWork } from '@/core/reminders';
import { isRecalled, Rating, usualResponseMs, type Grade } from '@/core/rating';
import { createScheduler, type CardSchedule } from '@/core/scheduler';
import { DAY_MS, endOfLocalDay, localDay, startOfLocalDay } from '@/core/time';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import {
  card,
  item,
  mistake,
  pendingGrade,
  review,
  studySession,
  type CardRow,
  type ItemRow,
} from '../schema';
import { activeCram, cramCards, isCrammed } from './cram';
import { drillReadyItems } from './curriculum';
import { grammarForCategory } from './grammar';
import { getAllSettings } from './settings';
import { pullForwardGrammar } from './weak-spots';

/** A new item's first card: recognition for a word, the drill for a grammar point. */
const FIRST_CARD_TYPES: CardType[] = ['recognize', 'apply_grammar'];

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
    .where(inArray(card.type, FIRST_CARD_TYPES))
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
    .where(notInArray(card.type, FIRST_CARD_TYPES))
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

/** Cards with a translation waiting to be graded. */
export function waitingCardIds(db: DbOrTx): Set<number> {
  const rows = db
    .select({ exercise: pendingGrade.exercise })
    .from(pendingGrade)
    .where(eq(pendingGrade.status, 'pending'))
    .all();
  return new Set(rows.flatMap((r) => r.exercise.targets.map((t) => t.cardId)));
}

/** Cram mode's work for today, or null when it is off or the exam is over. */
export function todayCram(
  db: DbOrTx,
  now: Date,
  context = { unlocked: unlockedItemIds(db, now), waiting: waitingCardIds(db) },
): CramPicks | null {
  const plan = activeCram(db, now);
  if (!plan) return null;
  return cramPicks(cramCards(db, plan, now, context), {
    today: localDay(now),
    examDay: plan.examDay,
    now: now.getTime(),
  });
}

/** What cram mode would ask today for these chapters and exam day, before it starts. */
export function previewCram(
  db: DbOrTx,
  input: { chapterIds: number[]; examDay: string },
  now: Date,
): CramPicks {
  const plan = { ...input, startedAt: now.getTime() };
  const context = { unlocked: unlockedItemIds(db, now), waiting: waitingCardIds(db) };
  return cramPicks(cramCards(db, plan, now, context), {
    today: localDay(now),
    examDay: input.examDay,
    now: now.getTime(),
  });
}

/**
 * Today's queue. Both daily limits count what was already done today, so a
 * second session the same day does not reset them. Grammar cards come only
 * with a drill ready, and cards with an answer waiting to be graded wait too.
 * In cram mode, the exam's cards for today join in.
 */
export function todayQueue(db: DbOrTx, now: Date): QueueEntry[] {
  const candidates = queueCandidates(db);
  const unlocked = unlockedItemIds(db, now);
  const waiting = waitingCardIds(db);
  return buildQueue(candidates, {
    now: now.getTime(),
    newItemsAllowance: dailyAllowance(db, now, candidates) - newItemsIntroducedToday(db, now),
    unlockedItemIds: unlocked,
    siblingCap: SIBLING_CAP - newSiblingCardsToday(db, now),
    drillReady: drillReadyItems(db),
    pullForward: pullForwardGrammar(db, now),
    excludeCardIds: waiting,
    cram: todayCram(db, now, { unlocked, waiting }) ?? undefined,
  });
}

/** Cards a weak-spot drill asks at most. */
export const FOCUS_SIZE = 10;

/**
 * A short drill on one weak spot, due or not: the grammar points about it
 * that have a drill ready, then the cards you made those mistakes on, most
 * recent mistake first. Cards you have not met yet stay out, and so do
 * cards with an answer waiting to be graded. Like weak spots, a wrong
 * meaning pick on a recognition card does not count.
 */
export function focusQueue(db: DbOrTx, category: MistakeCategory): QueueEntry[] {
  const candidates = new Map(queueCandidates(db).map((c) => [c.cardId, c]));
  const waiting = waitingCardIds(db);
  const drillReady = drillReadyItems(db);
  const grammar = grammarForCategory(db, category)
    .filter((r) => drillReady.has(r.item.id) && candidates.has(r.card.id))
    .map((r) => candidates.get(r.card.id)!);
  const missed = db
    .select({ cardId: review.cardId })
    .from(mistake)
    .innerJoin(review, eq(mistake.reviewId, review.id))
    .where(eq(mistake.category, category))
    .orderBy(desc(mistake.createdAt), desc(mistake.id))
    .all()
    .map((r) => candidates.get(r.cardId))
    .filter(
      (c): c is QueueCandidate =>
        c !== undefined && c.type !== 'recognize' && c.state !== CardState.New,
    );
  const seen = new Set<number>();
  const picked = [...grammar, ...missed].filter((c) => {
    if (seen.has(c.cardId) || waiting.has(c.cardId)) return false;
    seen.add(c.cardId);
    return true;
  });
  return spaceSiblings(
    picked.slice(0, FOCUS_SIZE).map((c) => ({
      cardId: c.cardId,
      itemId: c.itemId,
      type: c.type,
      kind: c.state === CardState.New ? ('new_item' as const) : ('review' as const),
      mode: practiceMode(c),
    })),
  );
}

/**
 * The work waiting on each of the next `days` days, today first, for the
 * reminders to name. Today's is today's queue. A later day holds every
 * review card due by its end, as if you did not study before then, and
 * about a day's new words.
 */
export function upcomingWork(db: DbOrTx, now: Date, days: number): ReminderWork[] {
  const today = summarizeQueue(todayQueue(db, now));
  const waiting = waitingCardIds(db);
  const candidates = queueCandidates(db).filter((c) => !waiting.has(c.cardId));
  const reviews = candidates.filter((c) => c.state !== CardState.New);
  const unmet = candidates.filter(
    (c) => c.state === CardState.New && FIRST_CARD_TYPES.includes(c.type),
  ).length;
  const newWords = Math.min(unmet, dailyAllowance(db, now, candidates));
  return Array.from({ length: days }, (_, ahead) => {
    if (ahead === 0) return { reviews: today.due + today.newCards, newWords: today.newItems };
    const end = endOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead));
    return { reviews: reviews.filter((c) => c.due < end).length, newWords };
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

/** Words to draw multiple-choice distractors from. A grammar point's label would give it away. */
export function distractorPool(db: DbOrTx) {
  return db
    .select({ id: item.id, kind: item.kind, meanings: item.meanings })
    .from(item)
    .where(and(eq(item.status, 'active'), ne(item.kind, 'grammar')))
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
 * in a single transaction, written the moment you answer. A lapse that
 * makes the card a leech flags it, and a wrong word that is another deck
 * word is logged as a confusion between the two. A card being crammed for
 * an exam is scheduled at the higher cram target recall.
 */
export function recordReview(db: DbOrTx, input: ReviewInput, now: number): CardSchedule {
  const usualRecall = getAllSettings(db)['study.targetRecall'];
  const next = db.transaction((tx) => {
    const current = tx.select().from(card).where(eq(card.id, input.cardId)).get();
    if (!current) throw new Error(`Card ${input.cardId} not found`);
    const targetRecall = cramRecall(usualRecall, isCrammed(tx, current.itemId, now));
    const schedule = createScheduler({ targetRecall }).review(current, input.rating, now);
    const leech = schedule.lapses > current.lapses && isLeechLapse(schedule.lapses);
    tx.update(card)
      .set({ ...schedule, ...(leech ? { leechAt: now } : {}) })
      .where(eq(card.id, current.id))
      .run();
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
          confusedItemId:
            note.confusedItemId !== undefined
              ? note.confusedItemId
              : note.category === 'wrong_word'
                ? lookUpConfusion(tx, current.itemId, note.yourText)
                : null,
          createdAt: now,
        })
        .run();
    }
    return schedule;
  });
  notifyChange('card', 'review', 'mistake');
  return next;
}

/** The deck word a wrong answer is, if any. */
function lookUpConfusion(db: DbOrTx, itemId: number, given: string): number | null {
  const words = activeWords(db);
  const target = words.find((w) => w.id === itemId);
  return target ? confusedWith(given, target, words) : null;
}

const activeWords = (db: DbOrTx) =>
  db
    .select()
    .from(item)
    .where(eq(item.status, 'active'))
    .all()
    .filter((w) => w.kind !== 'grammar');

/**
 * Spot wrong answers that are another deck word, before the feedback is
 * shown. "stehen" for stellen or "liegen" for legen is only a letter or two
 * away, but it is a mix-up of two words, not a spelling slip, and it is
 * logged as one so the pair gets contrast exercises.
 */
export function spotConfusions(
  db: DbOrTx,
  itemId: number,
  mistakes: readonly MistakeNote[],
): MistakeNote[] {
  const open = mistakes.filter(
    (m) =>
      m.confusedItemId === undefined && (m.category === 'wrong_word' || m.category === 'spelling'),
  );
  if (open.length === 0) return [...mistakes];
  const words = activeWords(db);
  const target = words.find((w) => w.id === itemId);
  return mistakes.map((m) => {
    if (!open.includes(m)) return m;
    const id = target ? confusedWith(m.yourText, target, words) : null;
    const other = id === null ? undefined : words.find((w) => w.id === id);
    if (!other) return { ...m, confusedItemId: null };
    return {
      ...m,
      category: 'wrong_word',
      confusedItemId: other.id,
      explanation: `${displayLemma(other)} is another word (${other.meanings[0] ?? '…'}). Here it is ${m.correction}.`,
    };
  });
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
