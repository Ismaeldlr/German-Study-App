import { eq } from 'drizzle-orm';

import { DAY_MS } from '@/core/time';

import type { Db } from '../db';
import { card } from '../schema';
import { itemInput } from '../testing/fixtures';
import { createTestDb } from '../testing/test-db';
import { createItem } from './items';
import { activityByDay, progressReport, pulse, unlockedIds } from './progress';
import { finishStudySession, recordReview, startStudySession } from './study';

const day1 = new Date(2026, 9, 19, 9);
const at = (days: number, hours = 0) => new Date(day1.getTime() + days * DAY_MS + hours * 3600_000);

function answer(db: Db, cardId: number, rating: 1 | 2 | 3 | 4, when: Date, mode = 'classic') {
  recordReview(
    db,
    {
      cardId,
      rating,
      mode: mode as 'classic',
      responseMs: 2000,
      answer: 'x',
      correct: rating > 1,
    },
    when.getTime(),
  );
}

async function deck() {
  const db = await createTestDb();
  const id = createItem(db, itemInput(), day1.getTime());
  const cards = db.select().from(card).where(eq(card.itemId, id)).orderBy(card.id).all();
  return { db, cards };
}

describe('progress from the review log', () => {
  it('adds up XP per local day', async () => {
    const { db, cards } = await deck();
    answer(db, cards[0].id, 3, at(0));
    answer(db, cards[1].id, 1, at(0, 1));
    answer(db, cards[2].id, 3, at(1), 'translation');

    const days = activityByDay(db);
    expect(days.get('2026-10-19')).toEqual({ reviews: 2, xp: 12 });
    expect(days.get('2026-10-20')).toEqual({ reviews: 1, xp: 15 });
  });

  it('builds the streak, the level and today from the same log', async () => {
    const { db, cards } = await deck();
    for (let d = 0; d < 3; d++) answer(db, cards[0].id, 3, at(d));

    const today = pulse(db, at(2, 2));
    expect(today.streak).toMatchObject({ current: 3, activeToday: true });
    expect(today.today).toEqual({ reviews: 1, xp: 10 });
    expect(today.totalXp).toBe(30);
    expect(today.level.level).toBe(1);
  });

  it('counts the deck and unlocks badges', async () => {
    const { db, cards } = await deck();
    answer(db, cards[0].id, 3, at(0, -3));
    const session = startStudySession(db, at(0).getTime());
    finishStudySession(db, session, { cardsDone: 12, newItems: 0, accuracy: 1 }, at(0).getTime());

    const report = progressReport(db, at(0));
    expect(report.words).toBe(1);
    expect(report.deck).toMatchObject({ total: 1, learning: 1 });
    expect(report.stats).toMatchObject({ reviews: 1, perfectSessions: 1, earlyBird: true });
    expect(unlockedIds(report)).toEqual(
      expect.arrayContaining(['first-steps', 'perfect', 'early-bird']),
    );
    expect(unlockedIds(report)).not.toContain('night-owl');
  });
});
