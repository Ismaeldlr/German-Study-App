import { desc, like, sql } from 'drizzle-orm';

import { localDay, localMonth } from '@/core/time';
import type { ModelPrice } from '@/core/settings';
import { estimateCost } from '@/llm/pricing';
import type { UsageEntry, UsageRecorder } from '@/llm/types';

import { notifyChange } from '../changes';
import type { DbOrTx } from '../db';
import { llmUsage, type LlmUsageRow } from '../schema';
import { getSetting } from './settings';

/** Add one call's tokens to the row for its day, provider and model. */
export function recordUsage(db: DbOrTx, entry: UsageEntry, price: ModelPrice | undefined): void {
  const day = localDay(entry.at);
  const cost = estimateCost(entry, price);
  db.insert(llmUsage)
    .values({
      day,
      provider: entry.provider,
      model: entry.model,
      calls: 1,
      tokensIn: entry.inputTokens,
      tokensOut: entry.outputTokens,
      estimatedCost: cost,
    })
    .onConflictDoUpdate({
      target: [llmUsage.day, llmUsage.provider, llmUsage.model],
      set: {
        calls: sql`${llmUsage.calls} + 1`,
        tokensIn: sql`${llmUsage.tokensIn} + ${entry.inputTokens}`,
        tokensOut: sql`${llmUsage.tokensOut} + ${entry.outputTokens}`,
        estimatedCost: sql`${llmUsage.estimatedCost} + ${cost}`,
      },
    })
    .run();
  notifyChange('llm_usage');
}

export type UsageTotals = { calls: number; tokensIn: number; tokensOut: number; cost: number };

export function monthToDate(db: DbOrTx, at: Date): UsageTotals {
  const row = db
    .select({
      calls: sql<number>`coalesce(sum(${llmUsage.calls}), 0)`,
      tokensIn: sql<number>`coalesce(sum(${llmUsage.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${llmUsage.tokensOut}), 0)`,
      cost: sql<number>`coalesce(sum(${llmUsage.estimatedCost}), 0)`,
    })
    .from(llmUsage)
    .where(like(llmUsage.day, `${localMonth(at)}-%`))
    .get();
  return row ?? { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
}

export function recentUsage(db: DbOrTx, limit = 30): LlmUsageRow[] {
  return db.select().from(llmUsage).orderBy(desc(llmUsage.day), llmUsage.model).limit(limit).all();
}

/** A recorder that prices each call from the settings at the time it lands. */
export function createUsageRecorder(db: DbOrTx): UsageRecorder {
  return {
    record(entry) {
      const prices = getSetting(db, 'llm.prices');
      recordUsage(db, entry, prices[entry.model]);
    },
  };
}
