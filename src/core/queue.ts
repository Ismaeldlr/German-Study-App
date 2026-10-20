import { CardState } from './cards';
import type { CardType } from './model';
import { practiceMode, type PracticeMode } from './planner';

/**
 * Today's queue, in the Study session's order:
 * 1. Warm-up: up to WARMUP_SIZE due classic cards, oldest due first.
 * 2. Gap fill: due production cards still learning or young, then newly
 *    unlocked production cards, practised in generated sentences.
 * 3. Production: up to TRANSLATION_MAX mature production cards, translated.
 * 4. Grammar: due grammar drills, plus the one your weak spots pull forward.
 * 5. The rest: more due classic cards, mature cards past the translation
 *    cap, then other newly unlocked cards.
 * 6. New items up to today's allowance, each introduced first.
 * A new word starts with its recognition card; its gender, plural and
 * production cards unlock the next day, so you meet a word before you are
 * asked to produce it. A grammar card is only queued with a drill ready,
 * since it cannot be asked any other way. Whether a gap-fill or translation
 * entry really gets its exercise is decided when it is shown.
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
  /** Grammar items with a drill ready. Grammar cards without one wait. */
  drillReady?: ReadonlySet<number>;
  /** Grammar items to drill today even if not due: the top weak spot's. */
  pullForward?: ReadonlySet<number>;
  /** Cards whose answer is waiting to be graded. */
  excludeCardIds?: ReadonlySet<number>;
}

export const SIBLING_CAP = 20;
export const WARMUP_SIZE = 20;
/** "One or two translations" per session; more mature cards are asked as classic cards. */
export const TRANSLATION_MAX = 2;

/** Cards that are a new item's first card: recognition for words, the drill for grammar. */
const FIRST_CARDS: ReadonlySet<CardType> = new Set(['recognize', 'apply_grammar']);

export function buildQueue(
  candidates: readonly QueueCandidate[],
  options: QueueOptions,
): QueueEntry[] {
  const drillReady = options.drillReady ?? new Set<number>();
  const pullForward = options.pullForward ?? new Set<number>();
  const cards = candidates.filter(
    (c) =>
      !options.excludeCardIds?.has(c.cardId) &&
      (c.type !== 'apply_grammar' || drillReady.has(c.itemId)),
  );
  const byAge = (a: QueueCandidate, b: QueueCandidate) =>
    a.itemCreatedAt - b.itemCreatedAt || a.cardId - b.cardId;

  const due = cards
    .filter((c) => c.state !== CardState.New && c.due <= options.now)
    .sort((a, b) => a.due - b.due || a.cardId - b.cardId)
    .map((c) => entry(c, 'review'));

  const pulled = cards
    .filter(
      (c) =>
        c.type === 'apply_grammar' &&
        c.state !== CardState.New &&
        c.due > options.now &&
        pullForward.has(c.itemId),
    )
    .sort((a, b) => a.due - b.due)
    .slice(0, 1)
    .map((c) => entry(c, 'review'));

  const siblings = cards
    .filter(
      (c) =>
        c.state === CardState.New &&
        !FIRST_CARDS.has(c.type) &&
        options.unlockedItemIds.has(c.itemId),
    )
    .sort(byAge)
    .slice(0, Math.max(0, options.siblingCap ?? SIBLING_CAP))
    .map((c) => entry(c, 'new_card'));

  const newItems = cards
    .filter((c) => c.state === CardState.New && FIRST_CARDS.has(c.type))
    .sort(byAge)
    .slice(0, Math.max(0, options.newItemsAllowance))
    .map((c) => entry(c, 'new_item'));

  const dueClassic = due.filter((e) => e.mode === 'classic');
  const warmup = dueClassic.slice(0, WARMUP_SIZE);
  const gap = [...due, ...siblings].filter((e) => e.mode === 'gap_fill');
  const mature = due.filter((e) => e.mode === 'translation');
  const production = mature.slice(0, TRANSLATION_MAX);
  const overflow = mature.slice(TRANSLATION_MAX).map((e) => ({ ...e, mode: 'classic' as const }));
  const grammar = [...due.filter((e) => e.mode === 'grammar_drill'), ...pulled];
  const rest = [
    ...dueClassic.slice(WARMUP_SIZE),
    ...overflow,
    ...siblings.filter((e) => e.mode === 'classic'),
  ];

  return [
    ...spaceSiblings(warmup),
    ...spaceSiblings(gap),
    ...production,
    ...grammar,
    ...spaceSiblings(rest),
    ...newItems,
  ];
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
    drills: entries.filter((e) => e.mode === 'grammar_drill').length,
    translations: entries.filter((e) => e.mode === 'translation').length,
  };
}
