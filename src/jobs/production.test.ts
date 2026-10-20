/// <reference types="node" />
import { and, eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { BLANK } from '@/core/gap-fill';
import { Rating } from '@/core/rating';
import { DAY_MS } from '@/core/time';
import type { TranslationExercise } from '@/core/translation';
import { createChapter } from '@/data/repos/chapters';
import { unusedExercises } from '@/data/repos/exercises';
import { createGrammarItem } from '@/data/repos/grammar';
import { getPendingGrade, savePendingGrade, waitingGrades } from '@/data/repos/grading';
import { createItem, getItem } from '@/data/repos/items';
import { setSetting } from '@/data/repos/settings';
import { recordReview } from '@/data/repos/study';
import { card, review } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { createTestDb } from '@/data/testing/test-db';
import type { Services } from '@/features/services';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';

import { gradeAnswer, gradeWaiting } from './grading';
import { acceptContrast, pairTargets, runPrefetch } from './prefetch';

const NOW = new Date(2026, 9, 19, 9);
const T = NOW.getTime();

async function services(overrides: Partial<Services> = {}): Promise<Services> {
  const db = await createTestDb();
  setSetting(db, 'llm.provider', 'custom');
  setSetting(db, 'llm.customBaseUrl', 'http://mock.test/v1');
  setSetting(db, 'llm.model', 'mock-mini');
  setSetting(db, 'llm.prices', { 'mock-mini': { input: 0.1, output: 0.4 } });
  const chapter = createChapter(db, { number: 1, title: 'Wohnen', themes: ['Umzug'] });
  setSetting(db, 'study.currentChapterId', chapter);
  return {
    db,
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    fetch: createMockLlmFetch().fetch,
    now: () => NOW,
    ...overrides,
  };
}

const cardOf = (s: Services, itemId: number, type: string) =>
  s.db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, type as never)))
    .get()!;

/** All of an item's cards reviewed long ago and due now, so nothing new is waiting. */
function matureItem(s: Services, itemId: number) {
  for (const c of s.db.select().from(card).where(eq(card.itemId, itemId)).all()) {
    s.db
      .update(card)
      .set({
        state: CardState.Review,
        stability: 40,
        difficulty: 5,
        reps: 6,
        lastReview: T - 40 * DAY_MS,
        scheduledDays: 40,
        due: c.type === 'produce' ? T - 1000 : T + 20 * DAY_MS,
      })
      .where(eq(card.id, c.id))
      .run();
  }
}

const stellenInput = verbInput({
  lemma: 'stellen',
  verbPresent3: 'stellt',
  verbPreterite: 'stellte',
  verbParticiple: 'gestellt',
  verbAuxiliary: 'haben',
  separable: false,
  meanings: ['to put (upright)'],
});
const stehenInput = verbInput({
  lemma: 'stehen',
  verbPresent3: 'steht',
  verbPreterite: 'stand',
  verbParticiple: 'gestanden',
  verbAuxiliary: 'haben',
  separable: false,
  meanings: ['to stand'],
});

describe('prefetch for production and grammar', () => {
  it('writes one translation for two mature words, and a drill for a grammar point', async () => {
    const s = await services();
    const wohnung = createItem(s.db, itemInput(), T - 60 * DAY_MS);
    const umziehen = createItem(s.db, verbInput(), T - 60 * DAY_MS);
    matureItem(s, wohnung);
    matureItem(s, umziehen);
    const rule = createGrammarItem(
      s.db,
      {
        name: 'Dativ nach mit, bei, von',
        label: 'dative after mit, bei, von',
        summary: 'After mit, bei and von, use the dative.',
        examples: [{ de: 'Ich fahre mit dem Bus.', en: 'I go by bus.' }],
        categories: ['case_ending'],
      },
      null,
      T - DAY_MS,
    );

    const report = await runPrefetch(s);
    expect(report).toMatchObject({ translations: 1, drills: 1, rejected: 0, stoppedBy: null });

    const [translation] = unusedExercises(s.db, 'translation');
    expect(translation.itemIds).toEqual([wohnung, umziehen]);
    expect(translation.payload.targets.map((t) => t.cardId)).toEqual([
      cardOf(s, wohnung, 'produce').id,
      cardOf(s, umziehen, 'produce').id,
    ]);
    expect(translation.payload.reference).toMatch(/Wohnung/);
    expect(translation.payload.cues).toHaveLength(2);

    const [drill] = unusedExercises(s.db, 'grammar_drill');
    expect(drill.itemIds).toEqual([rule]);
    expect(drill.payload.items).toHaveLength(5);
    expect(drill.payload.items[0]).toMatchObject({ category: 'case_ending' });
    expect(drill.payload.items.every((i) => i.sentence.includes(BLANK))).toBe(true);

    // Covered now: the next run writes nothing new.
    const again = await runPrefetch(s);
    expect(again).toMatchObject({ translations: 0, drills: 0 });
  });

  it('pairs mature words two to a sentence', () => {
    expect(pairTargets([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(pairTargets([1, 2, 3], 4)).toEqual([[1, 2], [3]]);
  });

  it('writes a contrast set for two words you keep mixing up', async () => {
    const s = await services();
    const stellen = createItem(s.db, stellenInput, T - 5 * DAY_MS);
    const stehen = createItem(s.db, stehenInput, T - 5 * DAY_MS);
    const mixUp = (itemId: number, typed: string, at: number) =>
      recordReview(
        s.db,
        {
          cardId: cardOf(s, itemId, 'produce').id,
          rating: Rating.Again,
          mode: 'gap_fill',
          responseMs: 3000,
          answer: typed,
          correct: false,
          mistakes: [
            { category: 'wrong_word', yourText: typed, correction: '?', explanation: 'x' },
          ],
        },
        at,
      );
    mixUp(stellen, 'stehen', T - 2 * DAY_MS);
    mixUp(stehen, 'stellt', T - DAY_MS);

    const report = await runPrefetch(s);
    expect(report.contrasts).toBe(1);
    const [set] = unusedExercises(s.db, 'contrast');
    expect(set.itemIds).toEqual([stellen, stehen]);
    expect(set.payload.words.map((w) => w.cardId)).toEqual([
      cardOf(s, stellen, 'produce').id,
      cardOf(s, stehen, 'produce').id,
    ]);
    expect(set.payload.items.filter((i) => i.word === 0)).toHaveLength(3);
    expect(set.payload.explanation).toMatch(/stellen/);
    expect((await runPrefetch(s)).contrasts).toBe(0);
  });

  it('drops contrast items whose answer is not a form of their word', () => {
    const stellen = { ...stellenInput, id: 1, createdAt: 0, updatedAt: 0, status: 'active' };
    const words = [
      { item: stellen as never, cardId: 1, word: 'stellen', meaning: 'to put' },
      { item: null, cardId: null, word: 'stehen', meaning: 'to stand' },
    ];
    const items = (answers: [number, string][]) =>
      answers.map(([word, answer]) => ({
        word,
        sentence: `Ich ${BLANK} es hin.`,
        hint: 'x',
        answer,
        accepted: [],
        translation: 'x',
        explanation: 'x',
      }));
    const kept = acceptContrast(words, {
      explanation: 'Different verbs.',
      items: items([
        [0, 'stelle'],
        [1, 'stehe'],
        [0, 'stellst'],
        [1, 'steht'],
      ]),
    });
    expect(kept?.items).toHaveLength(4);
    expect(
      acceptContrast(words, {
        explanation: 'x',
        items: items([
          [0, 'lege'],
          [1, 'stehe'],
          [0, 'stellst'],
          [1, 'steht'],
        ]),
      }),
    ).toBeNull();
  });

  it('writes a memory hook for a new leech', async () => {
    const s = await services();
    const wohnung = createItem(s.db, itemInput(), T - 90 * DAY_MS);
    matureItem(s, wohnung);
    s.db
      .update(card)
      .set({ lapses: 6, leechAt: T - DAY_MS, due: T + 5 * DAY_MS })
      .where(eq(card.id, cardOf(s, wohnung, 'produce').id))
      .run();
    const report = await runPrefetch(s);
    expect(report.hooks).toBe(1);
    expect(getItem(s.db, wohnung)!.memoryHook).toMatch(/die Wohnung/);
  });
});

describe('grading translations', () => {
  async function waiting(s: Services, answer: string) {
    const wohnung = createItem(s.db, itemInput(), T - 60 * DAY_MS);
    matureItem(s, wohnung);
    const produce = cardOf(s, wohnung, 'produce');
    const exercise: TranslationExercise = {
      english: 'I like the flat.',
      reference: 'Ich mag die Wohnung.',
      cues: ['flat'],
      targets: [{ cardId: produce.id, itemId: wohnung, word: 'die Wohnung', meaning: 'flat' }],
      grammar: null,
    };
    const id = savePendingGrade(s.db, {
      exerciseId: null,
      exercise,
      answer,
      responseMs: 9000,
      answeredAt: T - DAY_MS,
    });
    return { id, produce };
  }

  it('grades waiting answers first thing in a prefetch run', async () => {
    const s = await services();
    const { id, produce } = await waiting(s, 'Ich mag die Wohnung.');
    const report = await runPrefetch(s);
    expect(report.graded).toBe(1);
    expect(getPendingGrade(s.db, id)).toMatchObject({ status: 'graded' });
    expect(s.db.select().from(review).all()).toEqual([
      expect.objectContaining({
        cardId: produce.id,
        mode: 'translation',
        rating: Rating.Good,
        reviewedAt: T - DAY_MS,
      }),
    ]);
  });

  it('rates a target you did not use as forgotten', async () => {
    const s = await services();
    const { id, produce } = await waiting(s, 'Ich mag das Haus.');
    const outcome = await gradeAnswer(s, id);
    expect(outcome.status).toBe('graded');
    if (outcome.status !== 'graded') return;
    expect(outcome.grade.targets[0]).toMatchObject({ cardId: produce.id, verdict: 'missing' });
    expect(outcome.ratings).toEqual([expect.objectContaining({ rating: Rating.Again })]);
    expect(outcome.grade.errors.length).toBeGreaterThan(0);
  });

  it('keeps an answer waiting while the provider cannot be reached', async () => {
    const offline = async () => {
      throw new TypeError('Network request failed');
    };
    const s = await services({ fetch: offline });
    const { id } = await waiting(s, 'Ich mag die Wohnung.');
    const report = await gradeWaiting(s);
    expect(report).toMatchObject({ graded: 0, fatal: true });
    expect(report.stoppedBy).toMatch(/Could not reach/);
    expect(getPendingGrade(s.db, id)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(waitingGrades(s.db)).toHaveLength(1);
  });
});
