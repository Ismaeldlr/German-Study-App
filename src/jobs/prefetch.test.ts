/// <reference types="node" />
import { eq } from 'drizzle-orm';

import { CardState } from '@/core/cards';
import { BLANK, sentenceHash } from '@/core/gap-fill';
import type { GapBundle } from '@/core/selector';
import { createChapter } from '@/data/repos/chapters';
import {
  exerciseStats,
  markExerciseUsed,
  nextGapExercise,
  unusedGapCount,
} from '@/data/repos/exercises';
import { createItem } from '@/data/repos/items';
import { gapTargets } from '@/data/repos/practice';
import { setSetting } from '@/data/repos/settings';
import { acceptSuggestion, pendingSuggestions, rejectSuggestion } from '@/data/repos/suggestions';
import { monthToDate } from '@/data/repos/usage';
import { card, item } from '@/data/schema';
import { itemInput, verbInput } from '@/data/testing/fixtures';
import { createTestDb } from '@/data/testing/test-db';
import type { Services } from '@/features/services';
import { createMemoryKeyStore } from '@/llm/key-store';
import { createMockLlmFetch } from '@/llm/testing/mock-llm-fetch';

import { acceptGapItems, runPrefetch } from './prefetch';
import { requestSuggestions } from './suggest';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 19, 9);

async function services(overrides: Partial<Services> = {}): Promise<Services> {
  const db = await createTestDb();
  setSetting(db, 'llm.provider', 'custom');
  setSetting(db, 'llm.customBaseUrl', 'http://mock.test/v1');
  setSetting(db, 'llm.model', 'mock-mini');
  setSetting(db, 'llm.prices', { 'mock-mini': { input: 0.1, output: 0.4 } });
  return {
    db,
    keyStore: createMemoryKeyStore({ custom: 'test-key' }),
    fetch: createMockLlmFetch().fetch,
    now: () => NOW,
    ...overrides,
  };
}

/**
 * Three words met two days ago, with production cards now due or unlocked.
 * A fourth, never-seen word keeps auto-suggest quiet unless `newWord` is false.
 */
function deck(s: Services, newWord = true) {
  const t = NOW.getTime() - 2 * DAY;
  const chapter = createChapter(s.db, { number: 1, title: 'Wohnen', themes: ['Wohnung'] });
  setSetting(s.db, 'study.currentChapterId', chapter);
  const ids = [
    createItem(s.db, itemInput({ chapterId: chapter }), t),
    createItem(s.db, verbInput({ chapterId: chapter }), t),
    createItem(
      s.db,
      itemInput({ lemma: 'Küche', plural: 'Küchen', meanings: ['kitchen'], chapterId: chapter }),
      t,
    ),
  ];
  for (const c of s.db.select().from(card).all()) {
    if (c.type === 'recognize') {
      s.db
        .update(card)
        .set({ state: CardState.Review, stability: 3, reps: 1, lastReview: t, due: t + 3 * DAY })
        .where(eq(card.id, c.id))
        .run();
    } else if (c.type === 'produce' && c.itemId === ids[1]) {
      s.db
        .update(card)
        .set({ state: CardState.Learning, reps: 1, lastReview: t, due: NOW.getTime() - 1000 })
        .where(eq(card.id, c.id))
        .run();
    }
  }
  if (newWord) {
    createItem(s.db, itemInput({ lemma: 'Zimmer', article: 'das', meanings: ['room'] }), t);
  }
  return { chapter, ids };
}

describe('prefetch', () => {
  it('generates a gap sentence for each production card due soon and logs the tokens', async () => {
    const s = await services();
    const { ids } = deck(s);
    expect(
      gapTargets(s.db, NOW)
        .map((t) => t.itemId)
        .sort(),
    ).toEqual([...ids].sort());

    const report = await runPrefetch(s);
    expect(report).toMatchObject({ generated: 3, rejected: 0, stories: 1, stoppedBy: null });
    expect(unusedGapCount(s.db)).toBe(3);
    // One call for the gap batch, one for the day's story.
    expect(monthToDate(s.db, NOW).calls).toBe(2);
    expect(monthToDate(s.db, NOW).cost).toBeGreaterThan(0);

    const cached = nextGapExercise(s.db, ids[1])!;
    expect(cached.payload.sentence).toContain(BLANK);
    expect(cached.payload.answer).toBe('umziehen');
    // Every target is covered and a story is waiting, so a second run has nothing to do.
    expect(gapTargets(s.db, NOW)).toEqual([]);
    expect((await runPrefetch(s)).generated).toBe(0);
    expect(monthToDate(s.db, NOW).calls).toBe(2);
  });

  it('never caches a sentence the card saw within its last five exercises', async () => {
    const s = await services();
    deck(s);
    await runPrefetch(s);
    expect(gapTargets(s.db, NOW)).toEqual([]);

    const wohnung = s.db.select().from(item).where(eq(item.lemma, 'Wohnung')).get()!;
    const shown = nextGapExercise(s.db, wohnung.id)!;
    markExerciseUsed(s.db, shown.id, NOW.getTime());
    const bundle: GapBundle = {
      id: 1,
      target: {
        cardId: shown.payload.cardId,
        itemId: wohnung.id,
        word: 'die Wohnung',
        meanings: ['flat'],
        forms: wohnung,
      },
      support: [],
      topic: 'Wohnung',
    };
    const again = { ...shown.payload, id: 1 };
    const fresh = {
      ...again,
      sentence: `Wir suchen schon lange eine neue ${BLANK} in Berlin.`,
    };
    const { rows, rejected } = acceptGapItems(s.db, [bundle], [again]);
    expect(rows).toEqual([]);
    expect(rejected).toBe(1);
    expect(acceptGapItems(s.db, [bundle], [fresh]).rows[0].hash).toBe(sentenceHash(fresh.sentence));
  });

  it('rejects sentences that do not use their target', async () => {
    const s = await services();
    const { ids } = deck(s);
    const wohnung = s.db.select().from(item).where(eq(item.id, ids[0])).get()!;
    const bundle: GapBundle = {
      id: 1,
      target: { cardId: 1, itemId: wohnung.id, word: 'die Wohnung', meanings: [], forms: wohnung },
      support: [],
      topic: 'x',
    };
    const item1 = {
      id: 1,
      sentence: `Der ${BLANK} ist groß.`,
      answer: 'Garten',
      accepted: [],
      cue: 'garden',
      translation: 'The garden is big.',
      glosses: [],
    };
    expect(acceptGapItems(s.db, [bundle], [item1])).toEqual({ rows: [], rejected: 1 });
  });

  it('stops at the budget cap and leaves the app to offline content', async () => {
    const s = await services();
    deck(s);
    setSetting(s.db, 'llm.monthlyCap', 0);
    const report = await runPrefetch(s);
    expect(report.generated).toBe(0);
    expect(report.stoppedBy).toMatch(/budget reached/);
    expect(unusedGapCount(s.db)).toBe(0);
  });

  it('does nothing without a key', async () => {
    const s = await services({ keyStore: createMemoryKeyStore() });
    deck(s);
    expect((await runPrefetch(s)).stoppedBy).toMatch(/No API key/);
  });

  it('keeps per-prompt stats, including bad sentences', async () => {
    const s = await services();
    deck(s);
    await runPrefetch(s);
    expect(exerciseStats(s.db)).toEqual([
      { mode: 'gap_fill', promptVersion: 'gen_gap_batch@1', ready: 3, used: 0, discarded: 0 },
      { mode: 'story', promptVersion: 'gen_story@1', ready: 1, used: 0, discarded: 0 },
    ]);
  });
});

describe('suggested words', () => {
  it('suggests on its own once the new words run out, and never repeats a rejected one', async () => {
    const s = await services();
    deck(s, false);
    const report = await runPrefetch(s);
    expect(report.suggestions).toBeGreaterThan(0);
    const pending = pendingSuggestions(s.db);
    expect(pending.length).toBe(report.suggestions);
    expect(pending.map((p) => p.lemma)).not.toContain('Wohnung');
    expect(pending[0].reason).toMatch(/Goes with/);

    // Not again today.
    expect((await runPrefetch(s)).suggestions).toBe(0);

    const [first, second] = pending;
    const itemId = acceptSuggestion(s.db, first.id, NOW.getTime())!;
    const added = s.db.select().from(item).where(eq(item.id, itemId)).get()!;
    expect(added).toMatchObject({ lemma: first.lemma, source: 'llm' });
    expect(s.db.select().from(card).where(eq(card.itemId, itemId)).all().length).toBeGreaterThan(0);
    rejectSuggestion(s.db, second.id);

    // Asking again skips both, and everything else already suggested.
    const before = pendingSuggestions(s.db).map((p) => p.lemma);
    await requestSuggestions(s, { topic: 'Wohnung' });
    const after = pendingSuggestions(s.db).map((p) => p.lemma);
    expect(after).not.toContain(first.lemma);
    expect(after).not.toContain(second.lemma);
    expect(new Set(after).size).toBe(after.length);
    expect(after.length).toBeGreaterThanOrEqual(before.length);
  });

  it('flags a suggested noun whose gender disagrees with Wiktionary', async () => {
    const s = await services();
    deck(s, false);
    await requestSuggestions(s, { topic: 'Garten' });
    const garten = pendingSuggestions(s.db).find((p) => p.lemma === 'Garten');
    expect(garten?.details?.flags.some((f) => /Wiktionary/.test(f.message))).toBe(true);
  });
});
