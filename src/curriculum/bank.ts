import { DRILL_SIZE, type GrammarDrill } from '@/core/drills';

import type { BankItem, Topic } from './types';

/**
 * Drawing drills from a topic's bank. Each drill takes the items you have
 * seen least, then longest ago, so the whole bank comes round before any
 * item repeats. Once every item has come up WORN_AFTER times, the bank is
 * worn: the LLM, when there is one, writes fresh drills for the topic.
 */

export const WORN_AFTER = 2;
/** A practice session on chosen topics asks a few more items per drill. */
export const TOPIC_DRILL_SIZE = 8;

export interface BankUse {
  count: number;
  /** When the item was last asked, epoch ms. */
  last: number;
}

export type BankUses = ReadonlyMap<string, BankUse>;

export function pickBankItems(
  bank: readonly BankItem[],
  uses: BankUses,
  size: number = DRILL_SIZE,
  random: () => number = Math.random,
): BankItem[] {
  const ranked = bank
    .map((item) => ({ item, use: uses.get(item.key), tie: random() }))
    .sort(
      (a, b) =>
        (a.use?.count ?? 0) - (b.use?.count ?? 0) ||
        (a.use?.last ?? 0) - (b.use?.last ?? 0) ||
        a.tie - b.tie,
    )
    .slice(0, size)
    .map((r) => r.item);
  // Least seen first would always put the same kind of item first; mix them.
  for (let i = ranked.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
  }
  return ranked;
}

/** A drill on a topic from its bank, remembering which items it asks. */
export function bankDrill(
  topic: Pick<Topic, 'id' | 'name' | 'drills'>,
  uses: BankUses,
  size: number = DRILL_SIZE,
  random: () => number = Math.random,
): GrammarDrill {
  const items = pickBankItems(topic.drills, uses, size, random);
  return {
    point: topic.name,
    items: items.map(({ key: _key, ...item }) => item),
    bank: { topic: topic.id, keys: items.map((i) => i.key) },
  };
}

export function isBankWorn(bank: readonly BankItem[], uses: BankUses): boolean {
  return bank.every((item) => (uses.get(item.key)?.count ?? 0) >= WORN_AFTER);
}
