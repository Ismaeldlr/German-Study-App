import { and, eq } from 'drizzle-orm';

import { DRILL_SIZE } from '@/core/drills';
import { Rating } from '@/core/rating';
import { getTopic } from '@/curriculum';
import { TOPIC_DRILL_SIZE, WORN_AFTER } from '@/curriculum/bank';

import type { Db } from '../db';
import { card, exercise, grammarNote, item } from '../schema';
import { createTestDb } from '../testing/test-db';
import { exportBackup, readBackup, restoreBackup } from './backup';
import { listChapters } from './chapters';
import {
  bankUses,
  currentLesson,
  drillReadyItems,
  fillMomenteChapters,
  needsFreshDrills,
  startTopic,
  startTopics,
  stopTopic,
  takeGrammarDrill,
  topicProgress,
  topicQueue,
} from './curriculum';
import { discardExercise, saveExercises } from './exercises';
import { drillTargets } from './practice';
import { setSetting } from './settings';
import { recordReview, todayQueue } from './study';

const NOW = new Date(2026, 9, 19, 9);
const T = NOW.getTime();
/** A fixed sequence instead of Math.random, so draws are repeatable. */
const seeded =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

function grammarCard(db: Db, itemId: number) {
  return db
    .select()
    .from(card)
    .where(and(eq(card.itemId, itemId), eq(card.type, 'apply_grammar')))
    .get()!;
}

describe('starting topics from the grammar path', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('adds a topic as a grammar item with its note and one drill card', () => {
    const id = startTopic(db, 'um-zu-damit', T);
    const row = db.select().from(item).where(eq(item.id, id)).get()!;
    const topic = getTopic('um-zu-damit')!;
    expect(row).toMatchObject({
      kind: 'grammar',
      lemma: topic.name,
      meanings: [topic.label],
      curriculumId: 'um-zu-damit',
      status: 'active',
    });
    const note = db.select().from(grammarNote).where(eq(grammarNote.itemId, id)).get()!;
    expect(note.ruleSummary).toBe(topic.summary);
    expect(note.categories).toEqual(topic.categories);
    expect(note.examples).toHaveLength(3);
    expect(grammarCard(db, id).state).toBe(0);
    expect(topicProgress(db).get('um-zu-damit')).toEqual({ itemId: id, state: 'new', due: null });
  });

  it('starts each topic once, and skips ids it does not know', () => {
    const first = startTopic(db, 'genus', T);
    const ids = startTopics(db, ['genus', 'plural', 'no-such-topic'], T);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(first);
    expect(db.select().from(item).all()).toHaveLength(2);
  });

  it('stops a topic without losing it, and brings it back when started again', () => {
    const id = startTopic(db, 'genus', T);
    stopTopic(db, 'genus', T);
    expect(topicProgress(db).get('genus')?.state).toBe('suspended');
    expect(drillReadyItems(db).has(id)).toBe(false);
    expect(startTopic(db, 'genus', T)).toBe(id);
    expect(topicProgress(db).get('genus')?.state).toBe('new');
  });

  it('files a topic under the chapter of the lesson that teaches it', () => {
    fillMomenteChapters(db, 'A2');
    const id = startTopic(db, 'konjunktiv-ratschlaege', T);
    const chapter = listChapters(db).find((c) => c.number === 6)!;
    expect(chapter).toMatchObject({ book: 'Momente A2', title: 'Du solltest mehr trainieren.' });
    expect(db.select().from(item).where(eq(item.id, id)).get()!.chapterId).toBe(chapter.id);
  });

  it('survives a backup and restore', async () => {
    startTopic(db, 'dass', T);
    const file = readBackup(JSON.parse(JSON.stringify(exportBackup(db, NOW)))).file;
    const other = await createTestDb();
    restoreBackup(other, file);
    expect(topicProgress(other).has('dass')).toBe(true);
  });
});

describe('drills from the bank', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('queues a new topic for today without an LLM drill', () => {
    const id = startTopic(db, 'weil', T);
    expect(drillReadyItems(db).has(id)).toBe(true);
    expect(todayQueue(db, NOW)).toContainEqual(
      expect.objectContaining({ itemId: id, kind: 'new_item', mode: 'grammar_drill' }),
    );
  });

  it('draws a drill of bank items and remembers it as a free, used exercise', () => {
    const id = startTopic(db, 'weil', T);
    const taken = takeGrammarDrill(db, id, T, { random: seeded() })!;
    const bank = getTopic('weil')!.drills;
    expect(taken.drill.point).toBe(getTopic('weil')!.name);
    expect(taken.drill.items).toHaveLength(DRILL_SIZE);
    for (const drillItem of taken.drill.items) {
      expect(bank.map((b) => b.sentence)).toContain(drillItem.sentence);
    }
    const row = db.select().from(exercise).where(eq(exercise.id, taken.exerciseId)).get()!;
    expect(row).toMatchObject({ provider: 'builtin', tokensIn: 0, tokensOut: 0, usedAt: T });
    expect(taken.drill.bank?.keys).toHaveLength(DRILL_SIZE);
  });

  it('asks every bank item before any comes back', () => {
    const id = startTopic(db, 'genus', T);
    const bank = getTopic('genus')!.drills;
    const rounds = Math.ceil(bank.length / DRILL_SIZE);
    const seen = new Set<string>();
    for (let i = 0; i < rounds; i++) {
      const taken = takeGrammarDrill(db, id, T + i * 1000, { random: seeded(i + 2) })!;
      taken.drill.bank!.keys.forEach((k) => seen.add(k));
    }
    expect(seen.size).toBe(bank.length);
    expect(needsFreshDrills(db, id)).toBe(false);
  });

  it('draws bigger drills for a practice round', () => {
    const id = startTopic(db, 'dativ', T);
    const taken = takeGrammarDrill(db, id, T, { size: TOPIC_DRILL_SIZE })!;
    expect(taken.drill.items).toHaveLength(TOPIC_DRILL_SIZE);
  });

  it('lets the LLM write drills only once the bank is worn out', () => {
    const id = startTopic(db, 'genus', T);
    expect(drillTargets(db, NOW).map((t) => t.itemId)).not.toContain(id);
    const bank = getTopic('genus')!.drills;
    const draws = Math.ceil((bank.length * WORN_AFTER) / DRILL_SIZE) + 1;
    for (let i = 0; i < draws; i++) takeGrammarDrill(db, id, T + i, { random: seeded(i + 5) });
    expect(needsFreshDrills(db, id)).toBe(true);
    expect(drillTargets(db, NOW).map((t) => t.itemId)).toContain(id);
  });

  it('counts a drill thrown out as bad as worn through', () => {
    const id = startTopic(db, 'genus', T);
    const taken = takeGrammarDrill(db, id, T)!;
    discardExercise(db, taken.exerciseId, T);
    const uses = bankUses(db, id);
    for (const key of taken.drill.bank!.keys) expect(uses.get(key)?.count).toBe(WORN_AFTER);
  });

  it('prefers a cached LLM drill when there is one', () => {
    const id = startTopic(db, 'genus', T);
    const llmDrill = {
      point: 'der, die, das',
      items: getTopic('genus')!.drills.slice(0, DRILL_SIZE),
    };
    const [cachedId] = saveExercises(
      db,
      'grammar_drill',
      [{ itemIds: [id], topic: 'Alltag', payload: llmDrill, hash: 'abc' }],
      { provider: 'custom', model: 'mock', promptVersion: 'x@1', tokensIn: 10, tokensOut: 10 },
      T,
    );
    expect(takeGrammarDrill(db, id, T)?.exerciseId).toBe(cachedId);
    expect(takeGrammarDrill(db, id, T)?.exerciseId).not.toBe(cachedId);
  });

  it('has nothing for a grammar point of your own with no cached drill', () => {
    const id = db
      .insert(item)
      .values({ kind: 'grammar', lemma: 'Mein Punkt', meanings: [] })
      .returning({ id: item.id })
      .get().id;
    expect(takeGrammarDrill(db, id, T)).toBeNull();
  });
});

describe('practice sessions on chosen topics', () => {
  it('queues the started topics, due or not, and skips the rest', async () => {
    const db = await createTestDb();
    const [genus, plural] = startTopics(db, ['genus', 'plural'], T);
    recordReview(
      db,
      {
        cardId: grammarCard(db, plural).id,
        rating: Rating.Good,
        mode: 'grammar_drill',
        responseMs: 5000,
        answer: null,
        correct: true,
      },
      T,
    );
    stopTopic(db, 'plural', T);
    expect(topicQueue(db, ['genus', 'plural', 'dass'])).toEqual([
      {
        cardId: grammarCard(db, genus).id,
        itemId: genus,
        type: 'apply_grammar',
        kind: 'new_item',
        mode: 'grammar_drill',
      },
    ]);
    startTopic(db, 'plural', T);
    expect(topicQueue(db, ['plural'])[0]).toMatchObject({ itemId: plural, kind: 'review' });
  });
});

describe('Momente chapters', () => {
  it('fills the chapter list with a level and finds the lesson class is on', async () => {
    const db = await createTestDb();
    expect(fillMomenteChapters(db, 'B1')).toEqual({ created: 24, updated: 0 });
    const lesson4 = listChapters(db).find((c) => c.number === 4)!;
    setSetting(db, 'study.currentChapterId', lesson4.id);
    expect(currentLesson(db)).toMatchObject({
      book: 'B1.1',
      number: 4,
      title: 'Morgen, morgen …!',
    });
  });
});
