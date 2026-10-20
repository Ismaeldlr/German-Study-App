import { and, eq } from 'drizzle-orm';

import { CardState, displayLemma } from '@/core/cards';
import type { Example, MistakeCategory } from '@/core/model';
import { isAtRisk, practiceMode } from '@/core/planner';
import { createScheduler } from '@/core/scheduler';
import type { GapTarget, SupportWord } from '@/core/selector';
import { DAY_MS, endOfLocalDay } from '@/core/time';

import type { DbOrTx } from '../db';
import { card, grammarNote, item } from '../schema';
import { coverage, gapCoverage } from './exercises';
import { getSetting } from './settings';
import { waitingCardIds } from './study';
import { pullForwardGrammar } from './weak-spots';

/** What prefetch needs to know about the deck. */

function activeCards(db: DbOrTx) {
  return db
    .select({ card, item })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .where(and(eq(item.status, 'active'), eq(card.suspended, false)))
    .all();
}

/**
 * Production cards that will want a gap sentence soon and have none
 * waiting: due by the end of tomorrow, new but unlocked (their word was
 * introduced), or at risk. Soonest first.
 */
export function gapTargets(db: DbOrTx, now: Date): GapTarget[] {
  const time = now.getTime();
  const horizon = endOfLocalDay(new Date(time + DAY_MS));
  const scheduler = createScheduler({ targetRecall: getSetting(db, 'study.targetRecall') });
  const rows = activeCards(db);
  const introduced = new Set(
    rows.filter((r) => r.card.type === 'recognize' && r.card.reps > 0).map((r) => r.item.id),
  );
  const covered = gapCoverage(db);

  return rows
    .filter((r) => r.card.type === 'produce' && practiceMode(r.card) === 'gap_fill')
    .filter((r) => !covered.get(r.item.id))
    .filter((r) =>
      r.card.state === CardState.New
        ? introduced.has(r.item.id)
        : r.card.due <= horizon || isAtRisk(r.card, time, scheduler),
    )
    .sort((a, b) => soon(a.card, horizon) - soon(b.card, horizon) || a.card.id - b.card.id)
    .map(({ card: c, item: i }) => ({
      cardId: c.id,
      itemId: i.id,
      word: displayLemma(i),
      meanings: i.meanings,
      forms: i,
    }));
}

const soon = (c: { state: number; due: number }, horizon: number) =>
  c.state === CardState.New ? horizon : c.due;

/** Words you know, to appear around a target. At-risk ones are flagged. */
export function supportPool(db: DbOrTx, now: Date): SupportWord[] {
  const time = now.getTime();
  const scheduler = createScheduler({ targetRecall: getSetting(db, 'study.targetRecall') });
  const byItem = new Map<number, SupportWord>();
  for (const { card: c, item: i } of activeCards(db)) {
    if (c.state !== CardState.Review) continue;
    const entry = byItem.get(i.id) ?? { itemId: i.id, word: displayLemma(i), atRisk: false };
    entry.atRisk ||= isAtRisk(c, time, scheduler);
    byItem.set(i.id, entry);
  }
  return [...byItem.values()];
}

/**
 * Mature production cards that will want a translation soon and have none
 * waiting: due by the end of tomorrow, and not already waiting for a grade.
 */
export function translationTargets(db: DbOrTx, now: Date): GapTarget[] {
  const horizon = endOfLocalDay(new Date(now.getTime() + DAY_MS));
  const covered = coverage(db, 'translation');
  const waiting = waitingCardIds(db);
  return activeCards(db)
    .filter((r) => r.card.type === 'produce' && practiceMode(r.card) === 'translation')
    .filter((r) => r.card.due <= horizon && !covered.get(r.item.id) && !waiting.has(r.card.id))
    .sort((a, b) => a.card.due - b.card.due || a.card.id - b.card.id)
    .map(({ card: c, item: i }) => ({
      cardId: c.id,
      itemId: i.id,
      word: displayLemma(i),
      meanings: i.meanings,
      forms: i,
    }));
}

export interface DrillTarget {
  cardId: number;
  itemId: number;
  point: string;
  summary: string;
  examples: Example[];
  categories: MistakeCategory[];
}

/**
 * Grammar points that need a drill and have none waiting: the one your
 * weak spots pull forward first, then cards due by the end of tomorrow,
 * then new grammar points waiting to be introduced.
 */
export function drillTargets(db: DbOrTx, now: Date): DrillTarget[] {
  const horizon = endOfLocalDay(new Date(now.getTime() + DAY_MS));
  const covered = coverage(db, 'grammar_drill');
  const pulled = pullForwardGrammar(db, now);
  const rank = (c: { state: number; due: number; itemId: number }) =>
    pulled.has(c.itemId) ? 0 : c.state === CardState.New ? 2 : 1;
  return db
    .select({ card, item, note: grammarNote })
    .from(card)
    .innerJoin(item, eq(card.itemId, item.id))
    .leftJoin(grammarNote, eq(grammarNote.itemId, item.id))
    .where(
      and(eq(item.status, 'active'), eq(card.suspended, false), eq(card.type, 'apply_grammar')),
    )
    .all()
    .filter((r) => !covered.get(r.item.id))
    .filter((r) => pulled.has(r.item.id) || r.card.state === CardState.New || r.card.due <= horizon)
    .sort((a, b) => rank(a.card) - rank(b.card) || a.card.due - b.card.due || a.card.id - b.card.id)
    .map((r) => ({
      cardId: r.card.id,
      itemId: r.item.id,
      point: r.item.lemma,
      summary: r.note?.ruleSummary ?? r.item.meanings.join('; '),
      examples: r.note?.examples ?? [],
      categories: r.note?.categories ?? [],
    }));
}
