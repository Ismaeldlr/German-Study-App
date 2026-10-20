import { CardState } from './cards';
import {
  buildQueue,
  spaceSiblings,
  summarizeQueue,
  TRANSLATION_MAX,
  WARMUP_SIZE,
  type QueueCandidate,
} from './queue';
import { Rating } from './rating';
import {
  LEARN_AHEAD_MS,
  accuracy,
  deferAnswer,
  dropCards,
  nextEntry,
  progress,
  recordAnswer,
  startSession,
} from './session';

const now = new Date(2026, 9, 19, 9).getTime();
const HOUR = 3600_000;

let nextId = 1;
function card(overrides: Partial<QueueCandidate>): QueueCandidate {
  return {
    cardId: nextId++,
    itemId: 1,
    type: 'recognize',
    state: CardState.New,
    stability: 0,
    due: now,
    itemCreatedAt: 0,
    ...overrides,
  };
}

describe('daily queue', () => {
  it('puts due cards first, oldest due first, and skips cards not yet due', () => {
    const cards = [
      card({ itemId: 1, state: CardState.Review, due: now - HOUR }),
      card({ itemId: 2, state: CardState.Review, due: now - 5 * HOUR }),
      card({ itemId: 3, state: CardState.Review, due: now + HOUR }),
      card({ itemId: 4, state: CardState.New }),
    ];
    const queue = buildQueue(cards, { now, newItemsAllowance: 10, unlockedItemIds: new Set() });
    expect(queue.map((e) => [e.itemId, e.kind])).toEqual([
      [2, 'review'],
      [1, 'review'],
      [4, 'new_item'],
    ]);
  });

  it('introduces new items oldest first, up to the allowance', () => {
    const cards = [3, 1, 2].map((i) => card({ itemId: i, itemCreatedAt: i }));
    const queue = buildQueue(cards, { now, newItemsAllowance: 2, unlockedItemIds: new Set() });
    expect(queue.map((e) => e.itemId)).toEqual([1, 2]);
    expect(buildQueue(cards, { now, newItemsAllowance: -3, unlockedItemIds: new Set() })).toEqual(
      [],
    );
  });

  it("holds a new item's other cards until a day after its introduction", () => {
    const cards = [
      card({ itemId: 7, type: 'recognize', state: CardState.Learning, due: now + HOUR }),
      card({ itemId: 7, type: 'gender' }),
      card({ itemId: 7, type: 'plural' }),
    ];
    expect(buildQueue(cards, { now, newItemsAllowance: 10, unlockedItemIds: new Set() })).toEqual(
      [],
    );
    const unlocked = buildQueue(cards, {
      now,
      newItemsAllowance: 10,
      unlockedItemIds: new Set([7]),
    });
    expect(unlocked.map((e) => [e.type, e.kind])).toEqual([
      ['gender', 'new_card'],
      ['plural', 'new_card'],
    ]);
  });

  it('caps unlocked sibling cards per day', () => {
    const cards = Array.from({ length: 30 }, (_, i) => card({ itemId: i, type: 'produce' }));
    const all = new Set(cards.map((c) => c.itemId));
    expect(
      buildQueue(cards, { now, newItemsAllowance: 0, unlockedItemIds: all, siblingCap: 5 }),
    ).toHaveLength(5);
  });

  it('leaves grammar cards for generated exercises', () => {
    const cards = [card({ type: 'apply_grammar', state: CardState.Review, due: now - HOUR })];
    expect(buildQueue(cards, { now, newItemsAllowance: 10, unlockedItemIds: new Set() })).toEqual(
      [],
    );
  });

  it('keeps cards of the same item apart', () => {
    const spaced = spaceSiblings([
      { itemId: 1 },
      { itemId: 1 },
      { itemId: 1 },
      { itemId: 2 },
      { itemId: 3 },
    ]);
    expect(spaced.map((e) => e.itemId)).toEqual([1, 2, 3, 1, 1]);
  });

  it('runs a classic warm-up, gap fill for young production cards, then translations', () => {
    const due = (itemId: number, type: QueueCandidate['type'], state: number, stability = 5) =>
      card({ itemId, type, state, stability, due: now - itemId * HOUR });
    const cards = [
      due(1, 'produce', CardState.Learning),
      due(2, 'recognize', CardState.Review),
      due(3, 'produce', CardState.Review, 30),
      due(4, 'produce', CardState.Review, 5),
      due(5, 'gender', CardState.Review),
      card({ itemId: 6, type: 'produce' }),
      card({ itemId: 7, type: 'plural' }),
      card({ itemId: 8 }),
    ];
    const queue = buildQueue(cards, {
      now,
      newItemsAllowance: 5,
      unlockedItemIds: new Set([6, 7]),
    });
    expect(queue.map((e) => [e.itemId, e.type, e.mode])).toEqual([
      // Warm-up: classic due cards, oldest due first.
      [5, 'gender', 'classic'],
      [2, 'recognize', 'classic'],
      // Gap fill: due learning and young production cards, then new ones.
      [4, 'produce', 'gap_fill'],
      [1, 'produce', 'gap_fill'],
      [6, 'produce', 'gap_fill'],
      // Production: mature cards in a translation.
      [3, 'produce', 'translation'],
      // The rest, then new items.
      [7, 'plural', 'classic'],
      [8, 'recognize', 'classic'],
    ]);
  });

  it('caps the warm-up and moves further due cards after gap fill', () => {
    const cards = [
      ...Array.from({ length: WARMUP_SIZE + 2 }, (_, i) =>
        card({ itemId: 100 + i, state: CardState.Review, stability: 5, due: now - HOUR }),
      ),
      card({ itemId: 1, type: 'produce', state: CardState.Learning, due: now - HOUR }),
    ];
    const queue = buildQueue(cards, { now, newItemsAllowance: 0, unlockedItemIds: new Set() });
    expect(queue[WARMUP_SIZE]).toMatchObject({ itemId: 1, mode: 'gap_fill' });
    expect(queue).toHaveLength(WARMUP_SIZE + 3);
  });

  it('summarizes counts for the Home screen', () => {
    const cards = [
      card({ itemId: 1, state: CardState.Review, due: now - HOUR }),
      card({ itemId: 2, type: 'gender' }),
      card({ itemId: 3 }),
    ];
    const queue = buildQueue(cards, { now, newItemsAllowance: 5, unlockedItemIds: new Set([2]) });
    expect(summarizeQueue(queue)).toEqual({
      due: 1,
      newCards: 1,
      newItems: 1,
      drills: 0,
      translations: 0,
    });
  });
});

describe('daily queue: production and grammar', () => {
  const mature = (itemId: number, hoursAgo: number) =>
    card({
      itemId,
      type: 'produce',
      state: CardState.Review,
      stability: 30,
      due: now - hoursAgo * HOUR,
    });
  const grammar = (itemId: number, overrides: Partial<QueueCandidate> = {}) =>
    card({ itemId, type: 'apply_grammar', state: CardState.Review, stability: 5, ...overrides });

  it('translates at most two mature cards; the rest are asked as classic cards', () => {
    const cards = [mature(1, 3), mature(2, 2), mature(3, 1)];
    const queue = buildQueue(cards, { now, newItemsAllowance: 0, unlockedItemIds: new Set() });
    expect(TRANSLATION_MAX).toBe(2);
    expect(queue.map((e) => [e.itemId, e.mode])).toEqual([
      [1, 'translation'],
      [2, 'translation'],
      [3, 'classic'],
    ]);
  });

  it('drills due grammar after the translations, but only with a drill ready', () => {
    const cards = [
      grammar(10, { due: now - HOUR }),
      grammar(11, { due: now - 2 * HOUR }),
      mature(1, 1),
      card({ itemId: 2, state: CardState.Review, due: now - HOUR }),
    ];
    const queue = buildQueue(cards, {
      now,
      newItemsAllowance: 0,
      unlockedItemIds: new Set(),
      drillReady: new Set([10]),
    });
    expect(queue.map((e) => [e.itemId, e.mode])).toEqual([
      [2, 'classic'],
      [1, 'translation'],
      [10, 'grammar_drill'],
    ]);
  });

  it('pulls one grammar point forward for the top weak spot', () => {
    const cards = [
      grammar(10, { due: now + 5 * 24 * HOUR }),
      grammar(11, { due: now + 2 * 24 * HOUR }),
      grammar(12, { state: CardState.New }),
    ];
    const queue = buildQueue(cards, {
      now,
      newItemsAllowance: 0,
      unlockedItemIds: new Set(),
      drillReady: new Set([10, 11, 12]),
      pullForward: new Set([10, 11, 12]),
    });
    expect(queue.map((e) => [e.itemId, e.kind])).toEqual([[11, 'review']]);
  });

  it('introduces a new grammar point as a new item', () => {
    const cards = [grammar(10, { state: CardState.New, itemCreatedAt: 1 }), card({ itemId: 2 })];
    const queue = buildQueue(cards, {
      now,
      newItemsAllowance: 1,
      unlockedItemIds: new Set(),
      drillReady: new Set([10]),
    });
    expect(queue.map((e) => [e.itemId, e.kind, e.mode])).toEqual([[2, 'new_item', 'classic']]);
    const both = buildQueue(cards, {
      now,
      newItemsAllowance: 2,
      unlockedItemIds: new Set(),
      drillReady: new Set([10]),
    });
    expect(both.map((e) => [e.itemId, e.kind, e.mode])).toEqual([
      [2, 'new_item', 'classic'],
      [10, 'new_item', 'grammar_drill'],
    ]);
  });

  it('leaves out cards whose answer waits for grading', () => {
    const waiting = mature(1, 1);
    const queue = buildQueue([waiting, mature(2, 1)], {
      now,
      newItemsAllowance: 0,
      unlockedItemIds: new Set(),
      excludeCardIds: new Set([waiting.cardId]),
    });
    expect(queue.map((e) => e.itemId)).toEqual([2]);
  });

  it('counts drills and translations for the Home screen', () => {
    const queue = buildQueue([mature(1, 1), grammar(10, { due: now - HOUR })], {
      now,
      newItemsAllowance: 0,
      unlockedItemIds: new Set(),
      drillReady: new Set([10]),
    });
    expect(summarizeQueue(queue)).toMatchObject({ due: 2, drills: 1, translations: 1 });
  });
});

describe('session', () => {
  const a = {
    cardId: 1,
    itemId: 1,
    type: 'recognize' as const,
    kind: 'new_item' as const,
    mode: 'classic' as const,
  };
  const b = {
    cardId: 2,
    itemId: 2,
    type: 'gender' as const,
    kind: 'review' as const,
    mode: 'classic' as const,
  };

  it('walks the queue and brings learning cards back', () => {
    let state = startSession([a, b]);
    let step = nextEntry(state, now);
    expect(step.entry).toEqual(a);
    state = recordAnswer(step.state, a, { rating: Rating.Again, nextDue: now + 60_000 }, now);
    expect(state.newItemIds).toEqual([1]);

    step = nextEntry(state, now + 1000);
    expect(step.entry).toEqual(b);
    state = recordAnswer(
      step.state,
      b,
      { rating: Rating.Good, nextDue: now + 3 * 86_400_000 },
      now,
    );

    // Only the learning card is left; it is shown early, as a plain review.
    step = nextEntry(state, now + 2000);
    expect(step.entry).toEqual({ ...a, kind: 'review' });
    state = recordAnswer(
      step.state,
      step.entry!,
      { rating: Rating.Good, nextDue: now + LEARN_AHEAD_MS + 1 },
      now,
    );

    expect(nextEntry(state, now + 3000).entry).toBeNull();
    expect(state.answered).toBe(3);
    expect(accuracy(state)).toBeCloseTo(2 / 3);
  });

  it('counts unseen cards down, then the ones coming back', () => {
    let state = startSession([a, b]);
    expect(progress(state, false)).toEqual({ left: 2, again: 0 });
    let step = nextEntry(state, now);
    expect(progress(step.state, true)).toEqual({ left: 2, again: 0 });
    state = recordAnswer(step.state, a, { rating: Rating.Again, nextDue: now + 60_000 }, now);
    // Answered: one fewer unseen, and it is coming back.
    expect(progress(state, false)).toEqual({ left: 1, again: 1 });
    step = nextEntry(state, now + 1000);
    state = recordAnswer(step.state, b, { rating: Rating.Good, nextDue: now + 86_400_000 }, now);
    expect(progress(state, false)).toEqual({ left: 0, again: 1 });
    step = nextEntry(state, now + 2000);
    expect(progress(step.state, true)).toEqual({ left: 0, again: 1 });
  });

  it('stops at the deadline, after the card in hand', () => {
    let state = startSession([a, b], now + 10 * 60_000);
    const step = nextEntry(state, now);
    expect(step.entry).toEqual(a);
    state = recordAnswer(step.state, a, { rating: Rating.Good, nextDue: now + 86_400_000 }, now);
    const late = nextEntry(state, now + 10 * 60_000);
    expect(late.entry).toBeNull();
    expect(late.state.timeUp).toBe(true);
  });

  it('shows a learning card before the queue once it is due', () => {
    let state = startSession([a, b, { ...b, cardId: 3, itemId: 3 }]);
    let step = nextEntry(state, now);
    state = recordAnswer(step.state, a, { rating: Rating.Again, nextDue: now + 60_000 }, now);
    step = nextEntry(state, now + 61_000);
    expect(step.entry?.cardId).toBe(1);
  });
});

describe('session: exercises that rate several cards', () => {
  const entry = (cardId: number) => ({
    cardId,
    itemId: cardId,
    type: 'produce' as const,
    kind: 'review' as const,
    mode: 'gap_fill' as const,
  });

  it('drops cards an exercise already rated from the rest of the session', () => {
    let state = startSession([entry(1), entry(2), entry(3)]);
    const step = nextEntry(state, now);
    state = recordAnswer(
      step.state,
      entry(1),
      { rating: Rating.Again, nextDue: now + 60_000 },
      now,
    );
    state = dropCards(state, [1, 3]);
    expect(state.queue.map((e) => e.cardId)).toEqual([2]);
    expect(state.learning).toEqual([]);
    expect(dropCards(state, [])).toBe(state);
  });

  it('counts answers saved for grading without rating them', () => {
    const state = deferAnswer(startSession([entry(1)]));
    expect(state).toMatchObject({ deferred: 1, answered: 0 });
  });
});
