import { CardState } from './cards';
import type { CardType } from './model';
import { practiceMode, type PracticeMode } from './planner';

/**
 * Today's queue, in the Study session's order:
 * 1. Warm-up: up to WARMUP_SIZE due classic cards, oldest due first.
 * 2. Gap fill: due production cards still learning or young, then newly
 *    unlocked production cards, practised in generated sentences.
 * 3. The rest: more due classic cards, then other newly unlocked cards.
 * 4. New items up to today's allowance, each introduced first.
 * A new item starts with its recognition card; its gender, plural and
 * production cards unlock the next day, so you meet a word before you are
 * asked to produce it. Whether a gap-fill entry really gets a sentence is
 * decided when it is shown, since that depends on the cache.
 */

export interface QueueCandidate {
  cardId: number;
  itemId: number;
  type: CardType;
  state: number;
  stability: number;
  due: number;
  itemCreatedAt: number;
}

export type EntryKind = 'review' | 'new_item' | 'new_card';

export interface QueueEntry {
  cardId: number;
  itemId: number;
  type: CardType;
  kind: EntryKind;
  mode: PracticeMode;
}

export interface QueueOptions {
  now: number;
  /** New items still allowed today. */
  newItemsAllowance: number;
  /** Items whose recognition card was first reviewed before today. */
  unlockedItemIds: ReadonlySet<number>;
  /** Sibling cards still allowed today. */
  siblingCap?: number;
}

export const SIBLING_CAP = 20;
export const WARMUP_SIZE = 20;
/** Classic cards only; grammar cards need generated exercises. */
const CLASSIC_TYPES: ReadonlySet<CardType> = new Set([
  'recognize',
  'produce',
  'gender',
  'plural',
  'verb_forms',
]);

export function buildQueue(
  candidates: readonly QueueCandidate[],
  options: QueueOptions,
): QueueEntry[] {
  const cards = candidates.filter((c) => CLASSIC_TYPES.has(c.type));
  const byAge = (a: QueueCandidate, b: QueueCandidate) =>
    a.itemCreatedAt - b.itemCreatedAt || a.cardId - b.cardId;

  const due = cards
    .filter((c) => c.state !== CardState.New && c.due <= options.now)
    .sort((a, b) => a.due - b.due || a.cardId - b.cardId)
    .map((c) => entry(c, 'review'));

  const siblings = cards
    .filter(
      (c) =>
        c.state === CardState.New &&
        c.type !== 'recognize' &&
        options.unlockedItemIds.has(c.itemId),
    )
    .sort(byAge)
    .slice(0, Math.max(0, options.siblingCap ?? SIBLING_CAP))
    .map((c) => entry(c, 'new_card'));

  const newItems = cards
    .filter((c) => c.state === CardState.New && c.type === 'recognize')
    .sort(byAge)
    .slice(0, Math.max(0, options.newItemsAllowance))
    .map((c) => entry(c, 'new_item'));

  const dueClassic = due.filter((e) => e.mode === 'classic');
  const warmup = dueClassic.slice(0, WARMUP_SIZE);
  const gap = [...due, ...siblings].filter((e) => e.mode === 'gap_fill');
  const rest = [...dueClassic.slice(WARMUP_SIZE), ...siblings.filter((e) => e.mode === 'classic')];

  return [...spaceSiblings(warmup), ...spaceSiblings(gap), ...spaceSiblings(rest), ...newItems];
}

function entry(c: QueueCandidate, kind: EntryKind): QueueEntry {
  return { cardId: c.cardId, itemId: c.itemId, type: c.type, kind, mode: practiceMode(c) };
}

/** Keep two cards of the same item from coming back to back. */
export function spaceSiblings<T extends { itemId: number }>(entries: readonly T[], gap = 2): T[] {
  const pending = [...entries];
  const result: T[] = [];
  while (pending.length) {
    const recent = new Set(result.slice(-gap).map((e) => e.itemId));
    const index = Math.max(
      0,
      pending.findIndex((e) => !recent.has(e.itemId)),
    );
    result.push(pending.splice(index, 1)[0]);
  }
  return result;
}

export function summarizeQueue(entries: readonly QueueEntry[]) {
  return {
    due: entries.filter((e) => e.kind === 'review').length,
    newCards: entries.filter((e) => e.kind === 'new_card').length,
    newItems: entries.filter((e) => e.kind === 'new_item').length,
  };
}
