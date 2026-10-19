import { and, eq } from 'drizzle-orm';

import { CardState, displayLemma } from '@/core/cards';
import { isAtRisk, practiceMode } from '@/core/planner';
import { createScheduler } from '@/core/scheduler';
import type { GapTarget, SupportWord } from '@/core/selector';
import { DAY_MS, endOfLocalDay } from '@/core/time';

import type { DbOrTx } from '../db';
import { card, item } from '../schema';
import { gapCoverage } from './exercises';
import { getSetting } from './settings';

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
