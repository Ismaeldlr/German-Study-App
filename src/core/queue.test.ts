import { CardState } from './cards';
import {
  buildQueue,
  spaceSiblings,
  summarizeQueue,
  WARMUP_SIZE,
  type QueueCandidate,
} from './queue';
import { Rating } from './rating';
import {
  LEARN_AHEAD_MS,
  accuracy,
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

  it('runs a classic warm-up, then gap fill for learning and young production cards', () => {
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
      // Warm-up: classic due cards, oldest due first. Mature production stays classic.
      [5, 'gender', 'classic'],
      [3, 'produce', 'classic'],
      [2, 'recognize', 'classic'],
      // Gap fill: due learning and young production cards, then new ones.
      [4, 'produce', 'gap_fill'],
      [1, 'produce', 'gap_fill'],
      [6, 'produce', 'gap_fill'],
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
    expect(summarizeQueue(queue)).toEqual({ due: 1, newCards: 1, newItems: 1 });
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
