import { eq, sql } from 'drizzle-orm';

import { CRAM_REVIEWS } from '@/core/cram';
import { Rating } from '@/core/rating';
import { DAY_MS, localDay } from '@/core/time';

import type { Db } from '../db';
import { card, review } from '../schema';
import { itemInput } from '../testing/fixtures';
import { createTestDb } from '../testing/test-db';
import { createChapter } from './chapters';
import { activeCram, endCram, getCramPlan, isCrammed, startCram } from './cram';
import { createItem } from './items';
import { setSetting } from './settings';
import { recordReview, todayCram, todayQueue } from './study';

const day0 = new Date(2026, 9, 19, 9);
const at = (days: number, minutes = 0) =>
  new Date(day0.getTime() + days * DAY_MS + minutes * 60_000);

async function deck(words = 3) {
  const db = await createTestDb();
  const exam = createChapter(db, { number: 4, title: 'Arbeit', themes: [] });
  const other = createChapter(db, { number: 5, title: 'Reisen', themes: [] });
  const ids = Array.from({ length: words }, (_, i) =>
    createItem(db, itemInput({ lemma: `Wort${i}`, chapterId: exam }), day0.getTime() - DAY_MS),
  );
  const elsewhere = createItem(
    db,
    itemInput({ lemma: 'Koffer', article: 'der', chapterId: other }),
    day0.getTime() - DAY_MS,
  );
  return { db, exam, other, ids, elsewhere };
}

function answer(db: Db, cardId: number, when: Date, rating: 1 | 3 = Rating.Good) {
  return recordReview(
    db,
    { cardId, rating, mode: 'classic', responseMs: 2000, answer: 'x', correct: rating > 1 },
    when.getTime(),
  );
}

describe('cram plan', () => {
  it('starts, runs until the exam day is over, and ends', async () => {
    const { db, exam } = await deck();
    expect(activeCram(db, day0)).toBeNull();
    startCram(db, { chapterIds: [exam, exam], examDay: localDay(at(3)) }, day0.getTime());
    expect(getCramPlan(db)).toEqual({
      chapterIds: [exam],
      examDay: '2026-10-22',
      startedAt: day0.getTime(),
    });
    expect(activeCram(db, at(3, 600))).not.toBeNull();
    expect(activeCram(db, at(4))).toBeNull();
    endCram(db);
    expect(getCramPlan(db)).toBeNull();
  });

  it('knows which items are being crammed', async () => {
    const { db, exam, ids, elsewhere } = await deck();
    startCram(db, { chapterIds: [exam], examDay: localDay(at(3)) }, day0.getTime());
    expect(isCrammed(db, ids[0], day0.getTime())).toBe(true);
    expect(isCrammed(db, elsewhere, day0.getTime())).toBe(false);
    expect(isCrammed(db, ids[0], at(5).getTime())).toBe(false);
  });

  it('schedules crammed cards at a higher target recall', async () => {
    const { db, exam, ids, elsewhere } = await deck();
    const recognize = (itemId: number) =>
      db
        .select()
        .from(card)
        .where(eq(card.itemId, itemId))
        .all()
        .find((c) => c.type === 'recognize')!;
    startCram(db, { chapterIds: [exam], examDay: localDay(at(20)) }, day0.getTime());
    for (const itemId of [ids[0], elsewhere]) {
      answer(db, recognize(itemId).id, day0);
      answer(db, recognize(itemId).id, at(0, 15));
      answer(db, recognize(itemId).id, at(2));
    }
    // Same answers, same times: the crammed card comes back sooner.
    expect(recognize(ids[0]).due).toBeLessThan(recognize(elsewhere).due);
  });
});

describe("today's cram work", () => {
  it("introduces the exam's words past the allowance, and their other cards the next day", async () => {
    const { db, exam, ids, elsewhere } = await deck();
    setSetting(db, 'study.newItemsBase', 0);
    startCram(db, { chapterIds: [exam], examDay: localDay(at(5)) }, day0.getTime());

    const first = todayQueue(db, day0);
    expect(first.map((e) => [e.itemId, e.kind])).toEqual(ids.map((id) => [id, 'new_item']));
    expect(first.map((e) => e.itemId)).not.toContain(elsewhere);
    for (const entry of first) answer(db, entry.cardId, day0);

    const tomorrow = todayCram(db, at(1))!;
    // 3 words × 4 cards owe 2 days each, minus the 3 days done: 21 over 4 days.
    expect(tomorrow).toMatchObject({ quota: 6, daysLeft: 4, cards: 12, ready: 0 });
    const queue = todayQueue(db, at(1));
    expect(queue.filter((e) => e.kind === 'new_card').length).toBeGreaterThan(0);
  });

  it('reviews every new word’s cards on two days before the exam', async () => {
    const { db, exam } = await deck(6);
    setSetting(db, 'study.newItemsBase', 0);
    startCram(db, { chapterIds: [exam], examDay: localDay(at(6)) }, day0.getTime() - 60_000);

    for (let d = 0; d < 6; d++) {
      // Three sittings a day, so short learning steps come back as they would.
      for (const minutes of [0, 30, 60]) {
        for (const entry of todayQueue(db, at(d, minutes)))
          answer(db, entry.cardId, at(d, minutes));
      }
    }

    const examStart = at(6).getTime() - 9 * 3600_000;
    const days = db
      .select({
        cardId: review.cardId,
        days: sql<number>`count(distinct strftime('%Y-%m-%d', ${review.reviewedAt} / 1000, 'unixepoch', 'localtime'))`,
      })
      .from(review)
      .where(sql`${review.reviewedAt} < ${examStart}`)
      .groupBy(review.cardId)
      .all();
    expect(days).toHaveLength(24);
    expect(days.every((d) => d.days >= CRAM_REVIEWS)).toBe(true);
    expect(todayCram(db, at(6))).toMatchObject({ ready: 24 });
  });

  it('spreads known words over the days left instead of the night before', async () => {
    const { db, exam, ids } = await deck(5);
    // Learned long ago and not due for a month.
    db.update(card)
      .set({
        state: 2,
        stability: 40,
        difficulty: 5,
        due: at(30).getTime(),
        lastReview: at(-10).getTime(),
        reps: 6,
        scheduledDays: 40,
      })
      .run();
    startCram(db, { chapterIds: [exam], examDay: localDay(at(5)) }, day0.getTime() - 60_000);

    const perDay: number[] = [];
    for (let d = 0; d < 5; d++) {
      const queue = todayQueue(db, at(d));
      for (const entry of queue) answer(db, entry.cardId, at(d));
      perDay.push(queue.length);
    }
    // 20 cards owe 40 review days over 5 days: 8 a day.
    expect(perDay).toEqual([8, 8, 8, 8, 8]);
    expect(todayCram(db, at(5))).toMatchObject({ cards: ids.length * 4, ready: 20 });
  });
});
