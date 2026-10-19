import { eq } from 'drizzle-orm';

import { Rating } from '@/core/rating';
import { DAY_MS } from '@/core/time';

import { card, mistake, review } from '../schema';
import { createTestDb } from '../testing/test-db';
import { itemInput } from '../testing/fixtures';
import { createItem, setItemStatus } from './items';
import { setSetting } from './settings';
import {
  finishStudySession,
  getStudyCard,
  newItemsIntroducedToday,
  recordReview,
  startStudySession,
  todayQueue,
  unlockedItemIds,
  usualTimeFor,
} from './study';
import type { Db } from '../db';

const day1 = new Date(2026, 9, 19, 9);
const at = (days: number, hours = 0) => new Date(day1.getTime() + days * DAY_MS + hours * 3600_000);

function answer(db: Db, cardId: number, rating: number, when: Date) {
  return recordReview(
    db,
    {
      cardId,
      rating: rating as 1 | 2 | 3 | 4,
      mode: 'classic',
      responseMs: 2000,
      answer: 'x',
      correct: rating > 1,
    },
    when.getTime(),
  );
}

describe('recording a review', () => {
  it('updates FSRS state and writes the review in one transaction', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), day1.getTime());
    const [recognize] = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
    const next = answer(db, recognize.id, Rating.Good, day1);

    const saved = getStudyCard(db, recognize.id)!;
    expect(saved.card).toMatchObject({
      state: next.state,
      due: next.due,
      reps: 1,
      lastReview: day1.getTime(),
    });
    expect(saved.item.lemma).toBe('Wohnung');
    const logged = db.select().from(review).all();
    expect(logged).toEqual([
      expect.objectContaining({
        cardId: recognize.id,
        rating: 3,
        mode: 'classic',
        stateBefore: 0,
        correct: true,
      }),
    ]);
  });

  it('logs mistakes against the review and item', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), day1.getTime());
    const gender = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all()[2];
    recordReview(
      db,
      {
        cardId: gender.id,
        rating: 1,
        mode: 'classic',
        responseMs: 800,
        answer: 'der',
        correct: false,
        mistakes: [
          {
            category: 'article',
            yourText: 'der Wohnung',
            correction: 'die Wohnung',
            explanation: '',
          },
        ],
      },
      day1.getTime(),
    );
    expect(db.select().from(mistake).all()).toEqual([
      expect.objectContaining({ itemId: id, category: 'article', reviewId: 1 }),
    ]);
  });

  it('writes nothing if the card does not exist', async () => {
    const db = await createTestDb();
    expect(() => answer(db, 42, Rating.Good, day1)).toThrow();
    expect(db.select().from(review).all()).toEqual([]);
  });
});

describe("today's queue", () => {
  it('introduces new items up to the allowance and counts today', async () => {
    const db = await createTestDb();
    setSetting(db, 'study.newItemsBase', 2);
    for (const lemma of ['A', 'B', 'C'])
      createItem(db, itemInput({ lemma: `${lemma}haus` }), day1.getTime());
    let queue = todayQueue(db, day1);
    expect(queue.map((e) => e.kind)).toEqual(['new_item', 'new_item']);

    answer(db, queue[0].cardId, Rating.Good, day1);
    expect(newItemsIntroducedToday(db, day1)).toBe(1);
    queue = todayQueue(db, at(0, 1));
    // One introduced (now learning, due again in minutes) leaves room for one more.
    expect(queue.filter((e) => e.kind === 'new_item')).toHaveLength(1);
  });

  it('skips suspended items and suspended cards', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), day1.getTime());
    setItemStatus(db, id, 'suspended', day1.getTime());
    expect(todayQueue(db, day1)).toEqual([]);
  });

  it('respects the max new items setting', async () => {
    const db = await createTestDb();
    setSetting(db, 'study.newItemsBase', 10);
    setSetting(db, 'study.newItemsMax', 1);
    createItem(db, itemInput({ lemma: 'Eins' }), day1.getTime());
    createItem(db, itemInput({ lemma: 'Zwei' }), day1.getTime());
    expect(todayQueue(db, day1)).toHaveLength(1);
  });

  it('measures the usual answer time per card type', async () => {
    const db = await createTestDb();
    const id = createItem(db, itemInput(), day1.getTime());
    const [recognize] = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
    for (let i = 0; i < 5; i++) {
      recordReview(
        db,
        {
          cardId: recognize.id,
          rating: 3,
          mode: 'classic',
          responseMs: 1000 * (i + 1),
          answer: null,
          correct: true,
        },
        day1.getTime() + i,
      );
    }
    expect(usualTimeFor(db, 'recognize')).toBe(3000);
    expect(usualTimeFor(db, 'gender')).toBeNull();
  });

  it('records sessions', async () => {
    const db = await createTestDb();
    const id = startStudySession(db, day1.getTime());
    finishStudySession(
      db,
      id,
      { cardsDone: 12, newItems: 3, accuracy: 0.9 },
      day1.getTime() + 600_000,
    );
  });
});

/**
 * The Phase 1 exit check is a week of daily reviews of one chapter. This
 * runs that week against the real repositories, answering everything right.
 */
describe('a week of daily review', () => {
  it('introduces the chapter, unlocks sibling cards the next day and spaces reviews out', async () => {
    const db = await createTestDb();
    setSetting(db, 'study.newItemsBase', 10);
    const lemmas = ['Wohnung', 'Küche', 'Zimmer', 'Miete', 'Nachbar', 'Balkon', 'Garten', 'Flur'];
    for (const lemma of lemmas)
      createItem(db, itemInput({ lemma, plural: `${lemma}en` }), day1.getTime());

    const perDay: { day: number; reviews: number; newItems: number; newCards: number }[] = [];
    for (let d = 0; d < 7; d++) {
      let minutes = 0;
      const counts = { day: d, reviews: 0, newItems: 0, newCards: 0 };
      // Keep studying until nothing is left today, like finishing the session.
      for (let guard = 0; guard < 500; guard++) {
        const now = at(d, minutes / 60);
        const queue = todayQueue(db, now);
        const learningSoon = db
          .select()
          .from(card)
          .all()
          .filter((c) => (c.state === 1 || c.state === 3) && c.due <= now.getTime() + 20 * 60_000);
        const next =
          queue[0] ?? (learningSoon[0] && { cardId: learningSoon[0].id, kind: 'review' as const });
        if (!next) break;
        if (next.kind === 'new_item') counts.newItems++;
        else if (next.kind === 'new_card') counts.newCards++;
        else counts.reviews++;
        answer(db, next.cardId, Rating.Good, now);
        minutes += 11; // walk past learning steps
      }
      perDay.push(counts);
    }

    expect(perDay[0].newItems).toBe(8);
    expect(perDay[0].newCards).toBe(0);
    expect(unlockedItemIds(db, at(1))).toEqual(
      new Set(
        db
          .select()
          .from(card)
          .all()
          .map((c) => c.itemId),
      ),
    );
    // Day 2 introduces the produce, gender and plural cards: 3 per item.
    expect(perDay[1].newCards).toBe(20); // capped at 20 per day
    expect(perDay[2].newCards).toBe(4);
    // Later days have only reviews, and not every card every day.
    const allCards = db.select().from(card).all();
    expect(allCards.every((c) => c.state === 2)).toBe(true);
    expect(perDay[6].reviews).toBeLessThan(allCards.length);
    expect(Math.min(...allCards.map((c) => c.due))).toBeGreaterThan(at(6).getTime());
  });
});
