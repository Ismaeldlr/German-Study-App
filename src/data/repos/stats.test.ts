import { eq } from 'drizzle-orm';

import { DAY_MS } from '@/core/time';

import { card } from '../schema';
import { itemInput } from '../testing/fixtures';
import { createTestDb } from '../testing/test-db';
import { createChapter } from './chapters';
import { createGrammarItem } from './grammar';
import { createItem } from './items';
import { recordUsage } from './usage';
import { recordReview } from './study';
import { statsReport, studyMinutes } from './stats';

const now = new Date(2026, 9, 25, 12);
const t = now.getTime();

async function deck() {
  const db = await createTestDb();
  const one = createChapter(db, { number: 1, title: 'Zu Hause', themes: ['Wohnen'] });
  const two = createChapter(db, { number: 2, title: 'Essen', themes: [] });
  const flat = createItem(db, itemInput({ chapterId: one }), t - 20 * DAY_MS);
  createItem(db, itemInput({ lemma: 'Küche', chapterId: one }), t - 20 * DAY_MS);
  createItem(db, itemInput({ lemma: 'Brot', article: 'das', chapterId: two }), t - 20 * DAY_MS);
  createGrammarItem(
    db,
    {
      name: 'Dativ nach mit',
      label: 'mit takes the dative',
      summary: 'mit always takes the dative.',
      examples: [],
      categories: ['case_ending'],
    },
    null,
    t - 20 * DAY_MS,
  );
  const cards = db.select().from(card).where(eq(card.itemId, flat)).orderBy(card.id).all();
  return { db, cards, one, two };
}

/** Make every card of an item a mature review card due in `days` days. */
function mature(db: Awaited<ReturnType<typeof deck>>['db'], itemId: number, days: number) {
  db.update(card)
    .set({
      state: 2,
      stability: 30,
      difficulty: 5,
      due: t + days * DAY_MS,
      lastReview: t - 40 * DAY_MS,
      reps: 5,
    })
    .where(eq(card.itemId, itemId))
    .run();
}

describe('stats report', () => {
  it('counts words and grammar points by state', async () => {
    const { db } = await deck();
    mature(db, 1, 5);
    const report = statsReport(db, now);
    expect(report.words).toMatchObject({ total: 3, mature: 1, new: 2 });
    expect(report.grammar).toMatchObject({ total: 1, new: 1 });
  });

  it('measures real recall per mode against the target', async () => {
    const { db, cards } = await deck();
    mature(db, 1, -1);
    const answer = (cardId: number, rating: 1 | 3, mode: 'classic' | 'gap_fill', at: number) =>
      recordReview(
        db,
        { cardId, rating, mode, responseMs: 3000, answer: 'x', correct: rating > 1 },
        at,
      );
    answer(cards[0].id, 3, 'classic', t - 2 * DAY_MS);
    answer(cards[1].id, 1, 'gap_fill', t - 2 * DAY_MS);
    answer(cards[2].id, 3, 'classic', t - 12 * DAY_MS);

    const { recall, targetRecall } = statsReport(db, now);
    expect(targetRecall).toBe(0.9);
    expect(recall.overall.week).toEqual({ answers: 2, recalled: 1 });
    expect(recall.overall.month).toEqual({ answers: 3, recalled: 2 });
    expect(recall.modes.map((m) => [m.mode, m.month.answers])).toEqual([
      ['classic', 2],
      ['gap_fill', 1],
    ]);
  });

  it('forecasts reviews and shows coverage per chapter', async () => {
    const { db, one, two } = await deck();
    mature(db, 1, 3);
    const report = statsReport(db, now);
    expect(report.forecast[3].count).toBe(4);
    expect(report.chapters.map((c) => [c.chapter.id, c.counts.mature, c.counts.total])).toEqual([
      [one, 1, 2],
      [two, 0, 1],
    ]);
  });

  it('shows this month’s LLM spend against the cap', async () => {
    const { db } = await deck();
    recordUsage(
      db,
      { provider: 'openai', model: 'm', inputTokens: 1e6, outputTokens: 0, at: now },
      { input: 0.5, output: 1 },
    );
    expect(statsReport(db, now)).toMatchObject({ spend: { cost: 0.5 }, cap: 2 });
  });

  it('adds up minutes studied per day, today last', async () => {
    const { db, cards } = await deck();
    for (let i = 0; i < 4; i++) {
      recordReview(
        db,
        {
          cardId: cards[i % 2].id,
          rating: 3,
          mode: 'classic',
          responseMs: 5000,
          answer: 'x',
          correct: true,
        },
        t - DAY_MS + i * 60_000,
      );
    }
    const minutes = studyMinutes(db, now);
    expect(minutes).toHaveLength(14);
    expect(minutes[13]).toEqual({ day: '2026-10-25', minutes: 0 });
    // 5 s for the first answer, then three minutes between answers.
    expect(minutes[12].day).toBe('2026-10-24');
    expect(minutes[12].minutes).toBeCloseTo(3 + 5 / 60);
  });
});
